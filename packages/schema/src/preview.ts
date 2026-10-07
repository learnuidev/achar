import type { SchemaFieldType, SchemaType } from '@achar/types';

/**
 * What a list calls a document.
 *
 * The type's `preview` names the fields; this resolves them against one document
 * and hands back a title, an optional second line, and which field the media is
 * in — the field name rather than the asset, because the caller is a list that
 * already knows how to turn a reference into a URL and this function only knows
 * about the schema.
 *
 * `_id` is the fallback rather than `'(untitled)'`: an id is ugly and true, and a
 * list of forty rows all saying "(untitled)" is a list that has hidden the one
 * piece of information that would have found them.
 *
 * A type that names no preview is listed by the field it is most likely named
 * after — see `impliedTitle` — and only then by its id. That fallback is not
 * decoration: a type written by hand, or read out of a sample of somebody's data,
 * arrives with no preview configuration at all, and a list of twenty rows of ids
 * is a list that cannot be used. An explicit `preview` always wins.
 */
export function previewOf(
  type: SchemaType,
  document: Record<string, unknown>,
): { title: string; subtitle?: string; mediaField?: string } {
  const preview = type.preview;
  const title = stringAt(document, preview?.title) ?? stringAt(document, impliedTitle(type)) ?? stringAt(document, '_id') ?? '';
  const subtitle = stringAt(document, preview?.subtitle);
  const media = preview?.media ?? impliedMedia(type);

  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(media ? { mediaField: media } : {}),
  };
}

/** Fields that hold words, which is what a list can name a document from. */
const WORDY: readonly SchemaFieldType[] = ['string', 'text', 'slug', 'email', 'url'];

/** Fields that hold a picture, which is what a list can draw beside the name. */
const PICTORIAL: readonly SchemaFieldType[] = ['image', 'file'];

/**
 * The field a list should call this type's documents by, when the type did not say.
 *
 * `title` and `name` first, because a field called either of those is a field
 * somebody meant to be read; otherwise the first field holding words. Nothing here
 * is a guess about *meaning* — it is a guess about which field a list can show, and
 * the id is what happens when there is not one.
 */
function impliedTitle(type: SchemaType): string | undefined {
  const fields = type.fields ?? [];
  const named = fields.find((field) => field.name === 'title' || field.name === 'name');
  if (named) return named.name;
  return fields.find((field) => WORDY.includes(field.type))?.name;
}

/** The field a list should draw beside the name, when the type did not say. */
function impliedMedia(type: SchemaType): string | undefined {
  return (type.fields ?? []).find((field) => PICTORIAL.includes(field.type))?.name;
}

/**
 * A field's value as a string, at a dotted path.
 *
 * A path may run through a list — a `preview.title` of `metrics.0.label` — so a
 * numeric segment indexes an array rather than looking up a key, which is the one
 * place a path in this package is not simply an object lookup.
 */
function stringAt(document: Record<string, unknown>, path: string | undefined): string | undefined {
  if (!path) return undefined;

  let current: unknown = document;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' && current !== '' ? current : undefined;
}
