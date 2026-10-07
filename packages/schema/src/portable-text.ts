/**
 * Portable text, in the one shape it should be stored and answered in.
 *
 * Portable text is an array of blocks, and a block's text is an array of **spans** —
 * runs of characters that share their marks. Nothing about that shape says how long
 * a run may be, so an editor that appends one span per keystroke produces a
 * *correct* document that is unreadable: `"this is a body"` as fourteen spans of
 * one character, each with its own `_key`, is a document whose text is impossible
 * to see in a response and whose size is a function of how fast somebody types.
 *
 * So the canonical form is stated here: **adjacent spans with the same marks are one
 * span.** That is the rule the studio's editor regroups by, and it is enforced on
 * the way out of the API as well — a document written before the editor was fixed
 * reads as one span per run like any other, because the two shapes mean the same
 * thing and only one of them is what a person can read.
 *
 * It is deliberately structural rather than schema-driven: this runs on a value
 * coming out of a table, where the schema that declared the field is not in hand,
 * and a block is recognisable by what it is — an object with `children`, each of
 * them a span with text and marks. Anything that is not that is left exactly as it
 * was, which is what makes this safe to run over every field of every document.
 */

/** A span, as portable text stores it. */
interface SpanLike {
  _type?: unknown;
  text?: unknown;
  marks?: unknown;
  [key: string]: unknown;
}

interface BlockLike {
  children?: unknown;
  [key: string]: unknown;
}

/** Whether a value looks like portable text: blocks whose children are spans. */
export function isPortableTextValue(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;

  return value.every((node) => {
    if (!isRecord(node) || !Array.isArray((node as BlockLike).children)) return false;
    return ((node as BlockLike).children as unknown[]).every(
      (child) => isRecord(child) && (child as SpanLike)._type === 'span',
    );
  });
}

/**
 * The same portable text, with every run of identically-marked spans joined.
 *
 * Identity when there is nothing to join, so a read that changes nothing does not
 * rebuild the object — and so a caller can compare references to know whether the
 * document it was handed is the one that came out of the table.
 */
export function coalesceSpans<T>(value: T): T {
  if (!isPortableTextValue(value)) return value;

  return (value as unknown[]).map((node) => {
    const block = node as BlockLike;
    const children = block.children as SpanLike[];

    const joined: SpanLike[] = [];
    for (const child of children) {
      const last = joined[joined.length - 1];
      // Marks in a set order, because `['strong','em']` and `['em','strong']` are
      // the same two marks and a run must not be broken by how they were written.
      if (last && marksOf(last) === marksOf(child)) {
        last.text = `${typeof last.text === 'string' ? last.text : ''}${typeof child.text === 'string' ? child.text : ''}`;
        continue;
      }
      joined.push({ ...child });
    }

    return { ...block, children: joined };
  }) as unknown as T;
}

/** A span's text, whatever it is — a span with no text joins as nothing. */
export function spanText(span: SpanLike): string {
  return typeof span.text === 'string' ? span.text : '';
}

function marksOf(span: SpanLike): string {
  const marks = Array.isArray(span.marks) ? span.marks.filter((mark) => typeof mark === 'string') : [];
  return [...marks].sort().join('\u0000');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
