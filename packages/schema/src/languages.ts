/**
 * One value per language, and the rules that make it decidable.
 *
 * A localized field holds `{ en: "Hello", fr: "Bonjour" }` — see
 * `SchemaField.localized` in `@achar/types`. Everything here is the consequence of
 * that one shape, and there are only three of them:
 *
 * - **An object where a value belongs is a map of languages; anything else is the
 *   value.** Which of the two a stored value is has to be answerable from the value
 *   alone, because a read walks a document without knowing what any field once
 *   held — and it is answerable, but only just: an `object` field may not be
 *   localized (the refusal is in `services/api/src/lib/schemas.ts`), and a value
 *   that names an asset or a document carries `_ref`, `_id` or `_type`, which no
 *   language code does. `isLanguageMap` is that test, and those two facts are why
 *   it can be a test at all.
 * - **A value stored before its field was localized is the default language's.**
 *   Nothing recorded which language a plain string was in, and the default is the
 *   only answer that does not invent one: it is also the language a site reads by
 *   default, so the prose a dataset already had keeps being served.
 * - **A read answers one language, and says where it could not.** Missing is
 *   missing — `undefined`, `null`, or the key simply absent; an empty string is a
 *   value somebody typed — and the answer from another language is reported by path
 *   rather than passed off as a translation.
 */

import type { SchemaField, SchemaType } from '@achar/types';

/**
 * The keys that make an object a *value* rather than a map of languages.
 *
 * An asset is stored as `{ _ref: 'image-…' }` and a reference may be stored as the
 * document it resolved to, `{ _id, _type, … }`. Every one of those is an object
 * sitting where a localized value sits, and none of their keys is a language
 * code — so seeing one is how this tells the two apart.
 */
const VALUE_KEYS = ['_ref', '_id', '_type'] as const;

/**
 * Whether a stored value is a map of languages rather than a value.
 *
 * The naming is the API's, not this function's: nothing here knows which languages
 * a dataset has, so a map is recognized by its shape and its keys are read by
 * whoever knows the dataset. A caller holding the dataset validates the keys; this
 * only answers "is this one value, or several".
 */
export function isLanguageMap(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return !VALUE_KEYS.some((key) => key in value);
}

/** One language's value, and whether it had to come from somewhere else. */
export interface LanguageValue {
  value: unknown;
  /**
   * True when this language had no value of its own: what came back is the default
   * language's, or `null` when the default has none either.
   */
  untranslated: boolean;
}

/**
 * The value a localized field is answered with in one language.
 *
 * A missing value falls back to the default language, which is the whole reason a
 * site can be deployed in French on the day the French translation starts rather
 * than the day it finishes — and `untranslated` is the half that keeps it honest,
 * so a page can mark it, log it, or leave the field out entirely.
 */
export function languageValue(
  value: unknown,
  language: string,
  defaultLanguage: string,
): LanguageValue {
  if (!isLanguageMap(value)) {
    // A plain value belongs to the default language: it was written before the
    // field was localized, and the default is the language a site reads.
    return { value, untranslated: language !== defaultLanguage };
  }

  const own = value[language];
  if (own !== undefined && own !== null) return { value: own, untranslated: false };

  // The default language has nothing to fall back to. `null` rather than the map
  // or an omission, for the reason a projection writes `null` for a field that is
  // not there: a consumer reading `title` gets a value or a hole it can see.
  const fallback = language === defaultLanguage ? undefined : value[defaultLanguage];
  return { value: fallback ?? null, untranslated: true };
}

/**
 * A stored value with one language's value written into it.
 *
 * The studio's write, and the mirror of `languageValue`: editing a document in
 * French sets `fr` and leaves every other language alone, including the ones the
 * editor never loaded. A plain value is moved into the default language's slot on
 * the way, because the alternative is a document that holds a string *and* a map
 * for the same field.
 */
export function setLanguageValue(
  value: unknown,
  language: string,
  next: unknown,
  defaultLanguage: string,
): Record<string, unknown> {
  const map = isLanguageMap(value)
    ? value
    : value === undefined || value === null
      ? {}
      : { [defaultLanguage]: value };

  return { ...map, [language]: next };
}

/**
 * What a caller sent, read into the shape that gets stored.
 *
 * The write-side mirror of `resolveLanguages`, and the reason a caller does not
 * have to know which fields hold one value per language: `{ title: "Bonjour" }`
 * sent in French is stored as `{ title: { fr: "Bonjour" } }`, and a field the
 * schema does not mark localized is stored as it arrived. A value that is *already*
 * a map — an object, where a value belongs — is passed through untouched, which is
 * how a client that read a document writes two languages back in one request and
 * how each language keeps the others' values.
 *
 * A walk of the type, like its two siblings: the only thing that knows `title` is
 * translatable is the schema.
 */
export function localizeFields(
  type: SchemaType,
  fields: Record<string, unknown>,
  language: string,
): Record<string, unknown> {
  const next = { ...fields };
  for (const field of type.fields) {
    if (!(field.name in fields)) continue;
    next[field.name] = localizeOne(field, fields[field.name], language);
  }
  return next;
}

function localizeOne(field: SchemaField, value: unknown, language: string): unknown {
  if (field.localized) {
    // An object is the map itself, keys and all — see this file's opening note on
    // why that is decidable. Anything else is one value, and `language` is whose.
    return isLanguageMap(value) ? value : { [language]: value };
  }

  switch (field.type) {
    case 'object': {
      if (!isRecord(value)) return value;
      const next = { ...value };
      for (const sub of field.fields ?? []) {
        if (!(sub.name in value)) continue;
        next[sub.name] = localizeOne(sub, value[sub.name], language);
      }
      return next;
    }

    case 'array': {
      if (!Array.isArray(value)) return value;
      // Every member of `of` is applied to the same item, as in `coerce`: at most
      // the members matching the item do anything.
      return value.map((item) =>
        (field.of ?? []).reduce<unknown>((carried, member) => localizeOne(member, carried, language), item),
      );
    }

    default:
      return value;
  }
}

/** What one language's read of a document came to. */
export interface ResolvedLanguages {
  /** The document with every localized field answered in the language read. */
  document: Record<string, unknown>;
  /** The paths that came from another language, by dotted path. */
  untranslated: string[];
}

/**
 * A whole document in one language, and what that language was missing.
 *
 * A walk of the *type* rather than a sweep of the value, for the reason
 * `coerceDocument` is one: only the schema knows which fields are worth one value
 * per language, and a document's undeclared fields are nobody's to rewrite. The
 * paths in `untranslated` are the validator's own — `title`, `seo.title`,
 * `links[0].label` — so the same string addresses a field in a form, in a `patch`
 * and in this list.
 */
export function resolveLanguages(
  type: SchemaType,
  document: Record<string, unknown>,
  options: { language?: string; defaultLanguage?: string },
): ResolvedLanguages {
  const language = options.language ?? options.defaultLanguage ?? '';
  const defaultLanguage = options.defaultLanguage ?? language;
  const untranslated: string[] = [];

  const resolved = resolveFields(type.fields, document, language, defaultLanguage, '', untranslated);
  return { document: resolved, untranslated };
}

function resolveFields(
  fields: SchemaField[],
  value: Record<string, unknown>,
  language: string,
  defaultLanguage: string,
  prefix: string,
  untranslated: string[],
): Record<string, unknown> {
  const next = { ...value };

  for (const field of fields) {
    // An absent field is absent, as everywhere else: there is nothing to answer in
    // any language, and inventing `null` would turn "not sent" into "sent as
    // nothing".
    if (!(field.name in value)) continue;

    const path = prefix ? `${prefix}.${field.name}` : field.name;

    if (field.localized) {
      const answer = languageValue(value[field.name], language, defaultLanguage);
      if (answer.untranslated) untranslated.push(path);
      next[field.name] = answer.value;
      continue;
    }

    next[field.name] = resolveOne(field, value[field.name], language, defaultLanguage, path, untranslated);
  }

  return next;
}

/** One value, resolved through whatever containers it sits in. */
function resolveOne(
  field: SchemaField,
  value: unknown,
  language: string,
  defaultLanguage: string,
  path: string,
  untranslated: string[],
): unknown {
  switch (field.type) {
    case 'object':
      return isRecord(value)
        ? resolveFields(field.fields ?? [], value, language, defaultLanguage, path, untranslated)
        : value;

    case 'array':
      if (!Array.isArray(value)) return value;
      // `of` is a list of alternatives for one slot, so every member is applied to
      // the same item at the same path — the same rule as `coerce`, and for the
      // same reason: at most the members matching the item do anything.
      return value.map((item, index) =>
        (field.of ?? []).reduce<unknown>(
          (carried, member) =>
            resolveOne(member, carried, language, defaultLanguage, `${path}[${index}]`, untranslated),
          item,
        ),
      );

    default:
      return value;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
