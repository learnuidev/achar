/**
 * What a model is asked to translate, and where its answers go.
 *
 * The shape of this file follows from one decision: **a translation is written per
 * string, at a path, into the language's slot** — `title.fr`,
 * `body.fr.0.children.1.text` — rather than as a whole translated document. Three
 * things fall out of that:
 *
 * - Rich text keeps its structure. A paragraph is a list of runs of text with the
 *   same marks, so each run is translated where it sits and the blocks, their
 *   styles, their links and their embedded images are untouched. A model asked to
 *   return a whole Portable Text document returns something *shaped* like one, and
 *   the first thing lost is a link it did not think was content.
 * - A field with nothing in it is skipped rather than sent, so an untranslated
 *   document costs nothing, and an asset, a number or a reference is never offered
 *   to a model that would translate one if asked.
 * - Applying the answer is a patch of dotted paths, which is a write this API
 *   already has: no second write path, no whole-document replace, and the same
 *   revision, validation and conflict rules as an editor pressing save.
 *
 * What it deliberately does **not** do is decide anything. It reads a document and
 * produces items; the route calls the model; `translationPatch` turns the answers
 * into a patch. The part worth reading twice is `slotsFor`, where a schema's fields
 * become strings a translator can work on.
 */

import type { SchemaField, SchemaType } from '@achar/types';
import { isLanguageMap } from '@achar/schema';

import type { TranslationItem } from './bedrock';

/** One string in a stored document, and the path that addresses it. */
interface Slot {
  /**
   * The path to the string as segments — `['title', 'fr']`,
   * `['body', 'fr', 0, 'children', 1, 'text']`.
   *
   * Segments rather than a dotted string because a patch path is built from them at
   * the end, and an array index is a segment like any other:
   * `body.fr.0.children.1.text` is exactly what the store's `writePath` walks.
   */
  at: (string | number)[];
  /** How a person reads that address: `title`, `seo.note`, `body[0].span[1]`. */
  path: string;
  item: TranslationItem;
}

export interface Collected {
  slots: Slot[];
  /** Text the source language had nothing in, and paths there is nothing to do for. */
  skipped: string[];
}

/**
 * The field types a model has any business translating.
 *
 * Not `slug` — a URL segment is a routing decision rather than prose, and a
 * translated one moves the page. Not `url`, `email` or the closed set of `options`,
 * which are values rather than words. Not an asset or a reference, which carry no
 * words of their own. Everything else a person reads as text is here, rich text and
 * a list of strings included.
 */
const TRANSLATABLE = new Set(['string', 'text', 'portableText', 'array']);

/**
 * Everything worth sending to a model, for one language pair.
 *
 * `fields` narrows it, which is the escape hatch for a document too large to
 * translate in one call — a request whose own model call outlives the gateway has no
 * answer at all, and a caller can ask for `['title', 'excerpt']` twice instead.
 */
export function collectSlots(
  type: SchemaType,
  document: Record<string, unknown>,
  options: { from: string; to: string; defaultLanguage: string; fields?: string[] },
): Collected {
  const collected: Collected = { slots: [], skipped: [] };
  const asked = options.fields?.length ? [...options.fields] : [];

  walkFields(type.fields, document, '', options, collected, asked);

  // A path the caller asked for that nothing answered: a field the schema does not
  // declare, or one there is nothing to translate in. Reported rather than ignored,
  // because the alternative is somebody asking for `titel` and being told the
  // document was translated.
  for (const path of asked) {
    if (collected.skipped.includes(path)) continue;
    if (!collected.slots.some((slot) => under(slot.path, path))) collected.skipped.push(path);
  }

  return collected;
}

function walkFields(
  fields: SchemaField[],
  container: Record<string, unknown>,
  prefix: string,
  options: { from: string; to: string; defaultLanguage: string },
  collected: Collected,
  asked: string[],
): void {
  for (const field of fields) {
    if (!(field.name in container)) continue;

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    if (asked.length > 0 && !asked.some((scope) => under(path, scope) || under(scope, path))) continue;

    const value = container[field.name];

    if (field.localized) {
      collectLocalized(field, value, path, options, collected, asked);
      continue;
    }

    if (field.type === 'object' && isRecord(value)) {
      walkFields(field.fields ?? [], value, path, options, collected, asked);
      continue;
    }

    if (field.type === 'array' && Array.isArray(value)) {
      walkItems(field, value, path, options, collected, asked);
    }
  }
}

/** A list: one item shape repeated, so every item is looked at where it sits. */
function walkItems(
  field: SchemaField,
  items: unknown[],
  path: string,
  options: { from: string; to: string; defaultLanguage: string },
  collected: Collected,
  asked: string[],
): void {
  items.forEach((item, index) => {
    for (const member of field.of ?? []) {
      const itemPath = `${path}[${index}]`;

      // An item shape that is itself localized: the item *is* the map.
      if (member.localized) {
        collectLocalized(member, item, itemPath, options, collected, asked);
        continue;
      }

      if (member.type === 'object' && isRecord(item)) {
        walkFields(member.fields ?? [], item, itemPath, options, collected, asked);
      }
    }
  });
}

/**
 * One localized field's text in the source language, as items and where they go.
 *
 * **The source language's own value, never a fallback.** A read falls back to the
 * default language because a reader has to be shown something; a translation must
 * not, because a French value that fell back to English is not French to translate
 * French from — it is English, and translating it would produce English with a French
 * accent and mark it as a translation.
 */
function collectLocalized(
  field: SchemaField,
  value: unknown,
  path: string,
  options: { from: string; to: string; defaultLanguage: string },
  collected: Collected,
  asked: string[],
): void {
  const own = isLanguageMap(value) ? value[options.from] : undefined;

  if (!TRANSLATABLE.has(field.type)) {
    if (asked.includes(path)) collected.skipped.push(path);
    return;
  }

  if (own === undefined || own === null || (typeof own === 'string' && own.trim() === '')) {
    collected.skipped.push(path);
    return;
  }

  if (typeof own === 'string') {
    collected.slots.push({
      at: [...segmentsOf(path), options.to],
      path,
      item: { id: path, text: own },
    });
    return;
  }

  if (!Array.isArray(own)) {
    if (asked.includes(path)) collected.skipped.push(path);
    return;
  }

  if (field.type === 'portableText') {
    collectBlocks(own, path, options.to, collected);
    return;
  }

  // An array field: a list of strings is translated item by item, and a list of
  // anything else is left alone. Translating a list of objects as one value would be
  // asking a model to answer with a shape, and a shape is the one thing a model
  // cannot be trusted to keep.
  const strings = own.filter((item): item is string => typeof item === 'string');
  if (strings.length !== own.length) {
    collected.skipped.push(path);
    return;
  }

  own.forEach((item, index) => {
    if (item.trim() === '') return;
    const itemPath = `${path}[${index}]`;
    collected.slots.push({
      at: [...segmentsOf(path), options.to, index],
      path: itemPath,
      item: { id: itemPath, text: item },
    });
  });
}

/**
 * Rich text: one item per run of text, with the block it sits in as context.
 *
 * A run is text with one set of marks, so a paragraph holding a bold phrase is three
 * runs — and a run translated alone is a run translated out of context, which in a
 * language with a different word order is how a sentence comes back backwards. The
 * block's own text travels as context for that reason. The marks, the block style and
 * every mark definition stay exactly where they were: the words are translated, and
 * where a mark sits is left to the person who approves it.
 */
function collectBlocks(nodes: unknown[], path: string, to: string, collected: Collected): void {
  nodes.forEach((node, blockIndex) => {
    if (!isRecord(node) || !Array.isArray(node.children)) return;

    const block = node.children
      .map((child) => (isRecord(child) && typeof child.text === 'string' ? child.text : ''))
      .join('')
      .trim();

    node.children.forEach((child, spanIndex) => {
      if (!isRecord(child) || typeof child.text !== 'string' || child.text.trim() === '') return;

      const spanPath = `${path}[${blockIndex}].span[${spanIndex}]`;
      collected.slots.push({
        at: [...segmentsOf(path), to, blockIndex, 'children', spanIndex, 'text'],
        path: spanPath,
        item: {
          id: spanPath,
          text: child.text,
          // Only when it says more than the run does.
          ...(block && block !== child.text.trim() ? { context: block } : {}),
        },
      });
    });
  });
}

/**
 * The translations as the patch that writes them.
 *
 * Every path already names the language, which is why the patch carries no
 * `_language` of its own: the write is not "this value is in French", it is "these
 * French values", and saying both would be two ways to say one thing.
 */
export function translationPatch(
  collected: Collected,
  translations: Record<string, string>,
): Record<string, string> {
  const set: Record<string, string> = {};

  for (const slot of collected.slots) {
    const text = translations[slot.item.id];
    if (typeof text !== 'string') continue;
    set[slot.at.map(String).join('.')] = text;
  }

  return set;
}

/** The fields a translation wrote, as a person names them — `body`, not `body[0].span[1]`. */
export function translatedFields(collected: Collected): string[] {
  const fields = new Set<string>();
  for (const slot of collected.slots) fields.add(slot.path.split(/[.[]/)[0]!);
  return [...fields];
}

/** `seo.note` → `['seo','note']`; `links[0].label` → `['links','0','label']`. */
function segmentsOf(path: string): string[] {
  return path
    .split('.')
    .flatMap((segment) => segment.split(/[[\]]/).filter((part) => part !== ''));
}

/** Whether a path is at or under another: `seo` covers `seo.note`, `body` covers `body[0]`. */
function under(path: string, scope: string): boolean {
  return path === scope || path.startsWith(`${scope}.`) || path.startsWith(`${scope}[`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
