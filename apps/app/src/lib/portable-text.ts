/**
 * The bridge between a stored `PortableText` value and the block list an editor
 * can actually hold.
 *
 * The stored shape is a tree: a block has spans, a span has marks, and a mark
 * that carries data — a link — is a definition keyed off to the side. An editor
 * holds something flatter, because a person types into a line of text and only
 * occasionally means "these four words, in bold". These functions are the two
 * crossings, and they are pure and total so that neither side has to know about
 * the other: the studio's editor, its preview and the API all meet in the middle
 * on `PortableText`.
 *
 * Two invariants are worth stating, because everything downstream relies on them.
 * **A block always has at least one span** — a paragraph somebody emptied is
 * still a line, and a block with no children has no text to type into. **Adjacent
 * spans with the same marks are one span**, which is what keeps a document from
 * growing an array element per keystroke and what makes two documents with the
 * same content compare equal.
 */

import type {
  Asset,
  PortableText as PortableTextValue,
  PortableTextBlock,
  PortableTextImage,
  PortableTextMarkDef,
  PortableTextNode,
  PortableTextSpan,
} from '@achar/types';
import { randomKey } from '@/lib/format';

/**
 * A run of text and the marks on it, as an editor holds it.
 *
 * `_key` travels with the span rather than being minted on the way out, because
 * an edit that only changes one word must not reissue the keys of the run that
 * holds it: a document whose keys churn on every keystroke is a document that
 * diffs as if it were rewritten, and a block that was not touched at all should
 * come back byte for byte.
 */
export interface EditableSpan {
  text: string;
  marks: string[];
  _key?: string;
}

/** A block of rich text, with its spans already split into editable runs. */
export interface EditableBlock {
  kind: 'block';
  _key: string;
  style: PortableTextBlock['style'];
  listItem?: 'bullet' | 'number';
  level?: number;
  spans: EditableSpan[];
  markDefs: PortableTextMarkDef[];
}

/** An image, kept in place in the same list so that order survives an edit. */
export interface EditableImage {
  kind: 'image';
  _key: string;
  reference: string;
  alt: string;
  caption: string;
}

export type EditableNode = EditableBlock | EditableImage;

/** The marks the editor can toggle by name, as opposed to a mark definition. */
export const INLINE_MARKS = ['strong', 'em', 'code'] as const;
export type InlineMark = (typeof INLINE_MARKS)[number];

export const BLOCK_STYLES: { value: PortableTextBlock['style']; title: string }[] = [
  { value: 'normal', title: 'Normal' },
  { value: 'h2', title: 'Heading 2' },
  { value: 'h3', title: 'Heading 3' },
  { value: 'h4', title: 'Heading 4' },
  { value: 'blockquote', title: 'Quote' },
];

export function emptySpan(): EditableSpan {
  return { text: '', marks: [] };
}

/** A blank paragraph, which is what a new line and an empty field both are. */
export function emptyBlock(): EditableBlock {
  return { kind: 'block', _key: randomKey(), style: 'normal', spans: [emptySpan()], markDefs: [] };
}

/**
 * An image, from an asset in the library.
 *
 * The document stores the asset's `reference` rather than its URL: the URL is
 * built on read, so a CDN that moves does not orphan every document that
 * embedded one of its images.
 */
export function emptyImage(asset: Asset): EditableImage {
  return {
    kind: 'image',
    _key: randomKey(),
    reference: asset.reference,
    alt: asset.filename,
    caption: '',
  };
}

/** What a block reads as, with its marks thrown away — the textarea's value. */
export function blockText(block: EditableBlock): string {
  return block.spans.map((span) => span.text).join('');
}

// ── Sitting in the middle: characters ────────────────────────────────────────
//
// Every text edit and every mark toggle is the same operation — a range of
// characters, and what happens to them — so both go through a character array
// and both come back out through the same regrouping. Doing it any other way
// means two implementations of "which marks apply to the letter I just typed",
// and they would disagree.

interface MarkedChar {
  char: string;
  marks: string[];
  /** The span this character came from, so a run that survives keeps its key. */
  from?: string;
}

function toChars(spans: EditableSpan[]): MarkedChar[] {
  const chars: MarkedChar[] = [];
  for (const span of spans) {
    for (const char of span.text) {
      chars.push({ char, marks: [...span.marks], ...(span._key ? { from: span._key } : {}) });
    }
  }
  return chars;
}

/**
 * Characters back into spans.
 *
 * **A run of characters with the same marks is one span, whatever span it came
 * from.** That is the invariant the stored document wants — `"this is a body"` is
 * one span, not fourteen — and it is the rule this function got wrong: it only
 * joined characters that arrived carrying the *same* `from`, and typed characters
 * carry none at all, so every keystroke became a span of its own. A document that
 * is correct and unreadable, one `_key` per letter.
 *
 * The key rule is what `from` is actually for: a key belongs to one span, so a run
 * that was split by a mark keeps the key on its first half and the rest are new.
 * Joining characters that came from different spans therefore keeps the first key
 * and drops the later ones, which is harmless — a key nothing refers to is an
 * identity nobody needs, and no two spans end up sharing one.
 *
 * An empty list becomes a single empty span, which is the other invariant: an
 * empty block is a block with an empty run in it, not a block with no runs.
 */
function fromChars(chars: MarkedChar[]): EditableSpan[] {
  if (chars.length === 0) return [emptySpan()];

  const spans: EditableSpan[] = [];
  const claimed = new Set<string>();

  for (const { char, marks, from } of chars) {
    const last = spans[spans.length - 1];

    if (last && sameMarks(last.marks, marks)) {
      last.text += char;
      // The joined run can still take a key it did not have: the first character
      // of a run may be one this edit inserted, and the second may be the one that
      // carried the key.
      if (!last._key && from && !claimed.has(from)) {
        last._key = from;
        claimed.add(from);
      }
      continue;
    }

    const key = from && !claimed.has(from) ? from : undefined;
    if (key) claimed.add(key);
    spans.push({ text: char, marks: [...marks], ...(key ? { _key: key } : {}) });
  }

  return spans;
}

function sameMarks(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join('|') === [...b].sort().join('|');
}

/**
 * The new plain text, applied to the spans that produced the old one.
 *
 * A textarea hands back a whole value and nothing about what changed in it, so
 * the change is recovered by trimming the characters the two strings share at
 * each end: what is left is one splice, and a splice is the only edit a single
 * keystroke, a paste or a selection replaced by typing ever produces. The
 * inserted characters inherit the marks of the character at the join, which is
 * what keeps somebody typing inside a bold phrase in bold.
 */
export function spliceText(spans: EditableSpan[], nextText: string): EditableSpan[] {
  const current = spans.map((span) => span.text).join('');
  if (current === nextText) return spans;

  let start = 0;
  while (start < current.length && start < nextText.length && current[start] === nextText[start]) {
    start += 1;
  }

  let oldEnd = current.length;
  let newEnd = nextText.length;
  while (oldEnd > start && newEnd > start && current[oldEnd - 1] === nextText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const chars = toChars(spans);
  const inherited = chars[start]?.marks ?? chars[start - 1]?.marks ?? [];
  const inserted = [...nextText.slice(start, newEnd)].map<MarkedChar>((char) => ({
    char,
    marks: [...inherited],
  }));

  chars.splice(start, oldEnd - start, ...inserted);
  return fromChars(chars);
}

/**
 * Adds or removes a mark across a selection.
 *
 * Toggling rather than setting, and toggling on the whole selection rather than
 * the first character: a range that is entirely bold loses it and a range that is
 * only partly bold gains it, which is the behaviour every word processor has
 * trained people to expect. A collapsed selection — a cursor — marks nothing,
 * because there is nothing to mark yet.
 */
export function toggleMark(
  spans: EditableSpan[],
  start: number,
  end: number,
  mark: string,
): EditableSpan[] {
  if (end <= start) return spans;

  const chars = toChars(spans);
  const range = chars.slice(start, end);
  const allMarked = range.every((entry) => entry.marks.includes(mark));

  for (let index = start; index < end; index += 1) {
    const entry = chars[index];
    if (!entry) continue;
    entry.marks = allMarked
      ? entry.marks.filter((candidate) => candidate !== mark)
      : entry.marks.includes(mark)
        ? entry.marks
        : [...entry.marks, mark];
  }

  return fromChars(chars);
}

/** The marks every character in a range carries — what a toolbar lights up on. */
export function marksInRange(spans: EditableSpan[], start: number, end: number): string[] {
  if (end <= start) return [];
  const chars = toChars(spans);
  const range = chars.slice(start, end);
  const first = range[0];
  if (!first) return [];
  return first.marks.filter((mark) => range.every((entry) => entry.marks.includes(mark)));
}

/**
 * A link over a selection.
 *
 * A link is not a mark with a name: it needs somewhere to go, so it is a
 * definition in `markDefs` and the span carries the definition's key as a mark.
 * A selection that already carried a link has it replaced rather than nested,
 * because two links over the same words is not something a document can mean.
 * Removing one therefore has to take the definition it orphaned with it, which is
 * what `pruneMarkDefs` does on the way out.
 */
export function applyLink(
  block: EditableBlock,
  start: number,
  end: number,
  href: string,
): EditableBlock {
  if (end <= start) return block;

  const key = randomKey(10);
  const chars = toChars(block.spans);

  for (let index = start; index < end; index += 1) {
    const entry = chars[index];
    if (!entry) continue;
    entry.marks = [...entry.marks.filter((mark) => !isLink(mark, block.markDefs)), key];
  }

  return {
    ...block,
    spans: fromChars(chars),
    markDefs: [...block.markDefs, { _key: key, _type: 'link', href }],
  };
}

export function isLink(mark: string, defs: PortableTextMarkDef[]): boolean {
  return defs.some((def) => def._key === mark && def._type === 'link');
}

/** Drops definitions no span points at, so a removed link leaves nothing behind. */
export function pruneMarkDefs(block: EditableBlock): EditableBlock {
  const used = new Set(block.spans.flatMap((span) => span.marks));
  const markDefs = block.markDefs.filter((def) => used.has(def._key));
  return markDefs.length === block.markDefs.length ? block : { ...block, markDefs };
}

// ── The two crossings ────────────────────────────────────────────────────────

export function toEditable(value: PortableTextValue): EditableNode[] {
  if (!Array.isArray(value)) return [];

  const nodes: EditableNode[] = [];
  for (const node of value) {
    if (node._type === 'image') nodes.push(toEditableImage(node));
    else if (node._type === 'block') nodes.push(toEditableBlock(node));
    // Anything else is a node type this studio does not know how to edit. It is
    // dropped here rather than rendered as an empty line, because an editor that
    // drew a blank block for it would save that blank block over the real one.
  }
  return nodes;
}

function toEditableBlock(block: PortableTextBlock): EditableBlock {
  const spans = (Array.isArray(block.children) ? block.children : []).map<EditableSpan>((span) => ({
    text: typeof span.text === 'string' ? span.text : '',
    marks: Array.isArray(span.marks) ? [...span.marks] : [],
    ...(span._key ? { _key: span._key } : {}),
  }));

  return {
    kind: 'block',
    _key: block._key || randomKey(),
    style: block.style ?? 'normal',
    ...(block.listItem ? { listItem: block.listItem } : {}),
    ...(block.level ? { level: block.level } : {}),
    spans: spans.length > 0 ? spans : [emptySpan()],
    markDefs: Array.isArray(block.markDefs) ? block.markDefs.map((def) => ({ ...def })) : [],
  };
}

function toEditableImage(node: PortableTextImage): EditableImage {
  return {
    kind: 'image',
    _key: node._key || randomKey(),
    reference: node.asset?._ref ?? '',
    alt: node.alt ?? '',
    caption: node.caption ?? '',
  };
}

export function fromEditable(nodes: EditableNode[]): PortableTextValue {
  const value: PortableTextNode[] = [];

  for (const node of nodes) {
    if (node.kind === 'image') {
      if (!node.reference) continue;
      value.push({
        _type: 'image',
        _key: node._key,
        asset: { _type: 'reference', _ref: node.reference },
        ...(node.alt ? { alt: node.alt } : {}),
        ...(node.caption ? { caption: node.caption } : {}),
      });
      continue;
    }

    const block = pruneMarkDefs(node);
    const children: PortableTextSpan[] = (block.spans.length > 0 ? block.spans : [emptySpan()]).map(
      (span) => ({
        _type: 'span',
        // A span that was never edited keeps the key it arrived with; one that
        // was split or typed into gets a new one.
        _key: span._key ?? randomKey(),
        text: span.text,
        marks: [...span.marks],
      }),
    );

    value.push({
      _type: 'block',
      _key: block._key,
      style: block.style,
      ...(block.listItem ? { listItem: block.listItem } : {}),
      ...(block.level ? { level: block.level } : {}),
      children,
      markDefs: block.markDefs,
    });
  }

  return value;
}

/**
 * Whether a stored value is rich text this editor can hold.
 *
 * A form reads a document off the wire, and a field that was written by
 * something else — a seed, a migration, an older editor — may be a string, a
 * number, or nothing at all. Checking here is what lets the control draw an
 * empty editor for a value it cannot use instead of throwing inside a render.
 */
export function isPortableText(value: unknown): value is PortableTextValue {
  if (!Array.isArray(value)) return false;
  return value.every(
    (node) =>
      node !== null &&
      typeof node === 'object' &&
      typeof (node as { _type?: unknown })._type === 'string',
  );
}

/** Splits one node's key list so that React can follow a reorder without remounting. */
export function keyOf(node: EditableNode): string {
  return node._key;
}
