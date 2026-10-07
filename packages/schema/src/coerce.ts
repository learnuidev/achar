/**
 * A document as a caller sent it, read into the shape that gets stored.
 *
 * One rule, and it exists because of one mismatch. Rich text is stored as blocks of
 * spans, which is what an editor needs and what the renderer reads — but a caller
 * arriving over the API has a *string*. A script importing posts, a build step
 * writing a changelog, a migration out of another CMS: all of them have text, and
 * none of them has a caret, a toolbar or a selection. Asking each of them to
 * assemble `{"_type":"block","children":[{"_type":"span",…}]}` by hand is asking
 * every client to be an editor.
 *
 * So a `portableText` field accepts a string and it becomes blocks — see
 * `blocksFromText`, which is where the shape and the reason are set out. Nothing
 * else is touched: a field that is already an array of nodes is left exactly as it
 * arrived, which is what keeps the studio's writes and a script's writes the same
 * documents.
 *
 * **Values are converted, not repaired.** A string where a number belongs is still
 * a string when this is done with it, and validation refuses it with the message it
 * already had. This runs *before* validation precisely so that every other rule —
 * `required` most of all — is applied to what would actually be stored.
 *
 * It is deliberately a walk of the *type* rather than a sweep of the value: the
 * only way to know that `"Hello"` is a paragraph and not a malformed string is to
 * know the field it was sent for.
 *
 * A **localized** field is converted language by language, and the language is part
 * of the path each conversion is given — a block's `_key` is minted from its path,
 * and two languages minted from one path would collide.
 */

import type { SchemaField, SchemaType } from '@achar/types';

import { blocksFromText } from './portable-text';

export function coerceDocument(
  type: SchemaType,
  document: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...document };

  for (const field of type.fields) {
    // An absent field is absent. Adding one here would turn "not sent" into "sent
    // as nothing", which is the difference between a draft nobody has got to and a
    // field somebody emptied on purpose.
    if (!(field.name in document)) continue;
    next[field.name] = coerce(field, document[field.name], field.name);
  }

  return next;
}

/** One value, converted for the field it was sent for. */
function coerce(field: SchemaField, value: unknown, path: string): unknown {
  // A localized field holds a map, and the conversion belongs to each language's
  // value rather than to the map. The language is part of the path for a reason
  // `blocksFromText` cares about: it names the `_key` of every block it makes, and
  // two languages sharing a path would produce two blocks with one key.
  if (field.localized) {
    if (!isRecord(value)) return value;
    const next = { ...value };
    const inner: SchemaField = { ...field, localized: false };
    for (const [language, entry] of Object.entries(value)) {
      next[language] = coerce(inner, entry, `${path}.${language}`);
    }
    return next;
  }

  switch (field.type) {
    case 'portableText':
      return typeof value === 'string' ? blocksFromText(value, path) : value;

    case 'object': {
      if (!isRecord(value)) return value;
      const next = { ...value };
      for (const sub of field.fields ?? []) {
        if (!(sub.name in value)) continue;
        next[sub.name] = coerce(sub, value[sub.name], `${path}.${sub.name}`);
      }
      return next;
    }

    case 'array': {
      if (!Array.isArray(value)) return value;
      // `of` is a list of alternatives for one slot, so every member is applied to
      // the same item at the same path. They cannot fight: each member only
      // converts a value of the shape it declares, a string for rich text and a
      // record for an object, so at most the members matching the item do anything.
      return value.map((item, index) =>
        (field.of ?? []).reduce<unknown>(
          (carried, member) => coerce(member, carried, `${path}[${index}]`),
          item,
        ),
      );
    }

    default:
      return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
