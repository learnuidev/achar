/**
 * DynamoDB's wire format, rendered for a person.
 *
 * Every attribute arrives as a one-key wrapper — `{ S: "…" }`, `{ N: "42" }`,
 * `{ M: { … } }` — and unmarshalling it is what makes a row legible. Throwing
 * the type away, though, is what makes it *wrong*: an `N` holding `42` and an
 * `S` holding `"42"` print identically and match differently, and this is a
 * console somebody opens to answer exactly that kind of question. So both
 * travel: the value rendered for reading, and its type beside it.
 *
 * That is not a hypothetical here. Achar keeps its timestamps as strings —
 * `_updatedAt`, `createdAt` and `_rev` are ISO text, because the `UpdatedIndex`
 * sorts on `_updatedAt` and a number would have to be converted at every read —
 * while a count or a version a handler wrote is a number. `172348` and
 * `"172348"` are the same four pixels and different attributes.
 *
 * Pure functions over plain data, in `lib/` rather than in the server module,
 * because **one read feeds two renderings**. The tables tab draws rows as a
 * table and as JSON, both from the item the server sent, and a second
 * unmarshaller on the server would be a second answer to "what does this row
 * say" — the kind that drifts quietly.
 */

/** The most one value is rendered at, before it is clipped and said so. */
const MAX_VALUE_CHARS = 2000;

/** What a table cell or a JSON view shows for one attribute. */
export interface RenderedValue {
  /** Ready to draw. A long one is clipped, and says how long it was. */
  text: string;
  /** `S`, `N`, `BOOL`, `M`, … — never dropped, because `N` and `S` differ. */
  type: string;
}

/**
 * One attribute value, as it should read.
 *
 * A type this tab has never seen — DynamoDB adds them — is shown as JSON rather
 * than dropped, because a value nobody can read beats a value nobody can see.
 */
export function renderDynamoValue(value: unknown): RenderedValue {
  if (value === null || typeof value !== "object") {
    return { text: JSON.stringify(value) ?? "null", type: "?" };
  }

  const wrapper = value as Record<string, unknown>;
  const kind = Object.keys(wrapper)[0] ?? "?";

  switch (kind) {
    case "S":
      return clip({ text: String(wrapper.S), type: "S" });
    case "N":
      return { text: String(wrapper.N), type: "N" };
    case "BOOL":
      return { text: String(wrapper.BOOL), type: "BOOL" };
    case "NULL":
      return { text: "null", type: "NULL" };
    case "B":
      return { text: `‹binary, ${String(wrapper.B).length} base64 characters›`, type: "B" };
    case "SS":
    case "NS":
      return clip({ text: (wrapper[kind] as unknown[]).join(", "), type: kind });
    case "L":
    case "M":
      return clip({ text: JSON.stringify(unwrapDynamoValue(wrapper[kind])), type: kind });
    default:
      return clip({ text: JSON.stringify(wrapper), type: kind });
  }
}

/**
 * The plain value behind a wrapper.
 *
 * Used for the nested shapes — a schema's own `properties`, a webhook's
 * `filter`, a projection map — which are shown as JSON rather than as a rendered
 * table, because a table of arbitrary depth is a tree nobody asked this console
 * for. It is also what makes a `M` legible at all: a document's body is a map of
 * whatever fields the project's schema declares, and a row of `{ M: { S: … } }`
 * is a row nobody reads.
 */
export function unwrapDynamoValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unwrapDynamoValue);
  if (value === null || typeof value !== "object") return value;

  const wrapper = value as Record<string, unknown>;
  const kind = Object.keys(wrapper)[0];
  if (!kind) return value;

  switch (kind) {
    case "S":
    case "N":
      return wrapper[kind];
    case "BOOL":
      return wrapper.BOOL;
    case "NULL":
      return null;
    case "L":
    case "SS":
    case "NS":
      return unwrapDynamoValue(wrapper[kind]);
    case "M":
      return Object.fromEntries(
        Object.entries(wrapper.M as Record<string, unknown>).map(([key, nested]) => [
          key,
          unwrapDynamoValue(nested),
        ]),
      );
    default:
      return value;
  }
}

/**
 * One row's summary line: the values of its key attributes, `name=value`.
 *
 * Which is what a row is *called* when the columns run off the side of the card.
 * `DocumentsTable` is the table that makes this earn its place: its key is a
 * composed `{projectId}#{dataset}#{id}`, so the identity line says which project
 * and which dataset a document belongs to without the reader having to parse a
 * hash out of a truncated cell.
 */
export function dynamoKeyLine(
  item: Record<string, unknown>,
  keys: ReadonlyArray<{ name: string }>,
): string {
  const parts = keys
    .map((key) => {
      const raw = item[key.name];
      if (raw === undefined) return null;
      return `${key.name}=${renderDynamoValue(raw).text}`;
    })
    .filter((part): part is string => part !== null);

  return parts.join(" · ") || "no key attributes";
}

/**
 * Every attribute name in a page of rows, in a stable order.
 *
 * DynamoDB items are schemaless, so the columns of a table view are whatever the
 * page actually holds — which is why this is derived from the rows rather than
 * asked of the table. Nowhere is that more true than here: a document's
 * attributes are the fields some project's schema declared, so two rows of
 * `DocumentsTable` legitimately have different columns and neither the table nor
 * the console can predict them.
 *
 * Key attributes first, then alphabetical: the identity of a row is what
 * somebody reads first, and the rest is a list to scan.
 */
export function dynamoColumns(
  items: ReadonlyArray<Record<string, unknown>>,
  keys: ReadonlyArray<{ name: string }>,
): string[] {
  const seen = new Set<string>();
  for (const item of items) {
    for (const name of Object.keys(item)) seen.add(name);
  }

  const keyNames = keys.map((key) => key.name).filter((name) => seen.has(name));
  const rest = [...seen].filter((name) => !keyNames.includes(name)).sort();
  return [...keyNames, ...rest];
}

/** A value clipped to something a browser can draw. */
function clip(rendered: RenderedValue): RenderedValue {
  if (rendered.text.length <= MAX_VALUE_CHARS) return rendered;
  return {
    text: `${rendered.text.slice(0, MAX_VALUE_CHARS)}… (${rendered.text.length} characters)`,
    type: rendered.type,
  };
}
