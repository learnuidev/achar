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

/**
 * Whether a field holds one value per language.
 *
 * The rule the write and the read share: an asset (`image`, `video`, `file`) is
 * a reference and is never translated, and an `object` or `array` is a container
 * whose own fields decide one at a time. Every other field — a string, a number,
 * a date, a slug, a reference, rich text — holds one value per language, so it is
 * stored as `{ en: "…", fr: "…" }` rather than as one plain value that editing
 * French would overwrite for English too.
 *
 * A field the schema marks `localized` is translated whatever its type, because a
 * list of phrases is a real thing; the flag only widens the rule, it never narrows
 * it below the type default.
 */
export function isLocalizable(field: SchemaField): boolean {
  if (field.localized === true) return true;
  return (
    field.type !== 'image' &&
    field.type !== 'video' &&
    field.type !== 'file' &&
    field.type !== 'object' &&
    field.type !== 'array'
  );
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
  if (isLocalizable(field)) {
    // An object is the map itself, keys and all — see this file's opening note on
    // why that is decidable. Anything else is one value, and `language` is whose.
    return isLanguageMap(value) ? value : { [language]: value };
  }

  return localizeContainer(field, value, language);
}

/** An array item: an element is not a field, so only one the schema itself marks localized is a map. */
function localizeItem(field: SchemaField, value: unknown, language: string): unknown {
  if (field.localized === true) {
    return isLanguageMap(value) ? value : { [language]: value };
  }
  return localizeContainer(field, value, language);
}

function localizeContainer(field: SchemaField, value: unknown, language: string): unknown {
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
        (field.of ?? []).reduce<unknown>((carried, member) => localizeItem(member, carried, language), item),
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

    if (isLocalizable(field)) {
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
  // A localized field is answered the same way wherever it sits — an item of a list
  // is a field like any other, and a list of translated phrases is a shape somebody
  // modeling content can reasonably want.
  if (isLocalizable(field)) {
    const answer = languageValue(value, language, defaultLanguage);
    if (answer.untranslated) untranslated.push(path);
    return answer.value;
  }

  return resolveContainer(field, value, language, defaultLanguage, path, untranslated);
}

/** An array item: only one the schema itself marks localized is answered per language. */
function resolveItem(
  field: SchemaField,
  value: unknown,
  language: string,
  defaultLanguage: string,
  path: string,
  untranslated: string[],
): unknown {
  if (field.localized === true) {
    const answer = languageValue(value, language, defaultLanguage);
    if (answer.untranslated) untranslated.push(path);
    return answer.value;
  }
  return resolveContainer(field, value, language, defaultLanguage, path, untranslated);
}

function resolveContainer(
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
            resolveItem(member, carried, language, defaultLanguage, `${path}[${index}]`, untranslated),
          item,
        ),
      );

    default:
      return value;
  }
}

/**
 * `pt-BR` reads as "Brazilian Portuguese"; a code nothing can name comes back as it
 * was written.
 *
 * Here rather than in the app that draws it because two places need it and they are
 * not the same runtime: a studio draws a language in a select, and the API names one
 * in the prompt it sends a model — "translate into Brazilian Portuguese" is a
 * different instruction from "translate into pt-BR", and the difference is worth one
 * implementation rather than two that drift.
 *
 * Two things end at the raw code, and both are ordinary: a language the runtime's
 * ICU data does not know, which `Intl` answers with the code itself, and a string
 * that is not a language code at all, like the private tag `x-internal` the API
 * accepts, which `Intl` refuses with a `RangeError`. A guessed name would be worse
 * than the code in both cases, and the code is what the dataset stores anyway.
 */
export function languageName(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return code;

  try {
    const names = displayNames();
    if (!names) return trimmed;
    const name = names.of(trimmed);
    // The dataset's spelling is what queries and the editor carry, so it wins when
    // `of` merely echoes the code back — which it does, lowercased.
    return name && name.toLowerCase() !== trimmed.toLowerCase() ? name : trimmed;
  } catch {
    return trimmed;
  }
}

// Built once and on first use: constructing `Intl.DisplayNames` is not cheap, and a
// list of six languages would otherwise build six of them. `undefined` because the
// runtime may not have it at all, which is what the fallback above is for.
let displayNameCache: Intl.DisplayNames | null | undefined;

function displayNames(): Intl.DisplayNames | null {
  if (displayNameCache === undefined) {
    displayNameCache =
      typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(undefined, { type: 'language' })
        : null;
  }
  return displayNameCache;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * What a save has to write, **grouped by the language it is writing**.
 *
 * This is the shape a mutation wants, and the reason for it is the whole bug class it
 * removes. A patch's `set` *replaces* the value at the path it names, so a client that
 * sends a field's whole map — `set: { title: { en: '…', fr: '…' } }` — replaces every
 * language the map happens to hold: a language the client did not have is deleted, and
 * a language whose copy had gone stale is overwritten with it. Both are silent, and
 * both look exactly like "editing French changed the English".
 *
 * So a localized field is written **one language at a time**, naming the language the
 * write is in rather than the map: `{ set: { title: 'Bonjour' }, _language: 'fr' }` is
 * one language and cannot touch another. This function answers what those writes are,
 * by comparing the document in hand with the one it was loaded from — what a person
 * changed is what differs from what they were shown.
 *
 * A field that holds one value is grouped separately, because it has no language to be
 * in: replacing it is what editing it means.
 */
export interface ChangedPaths {
  /**
   * One entry per language, in the order they were found: the fields to write in that
   * language, and the paths to remove from it. A path is the *field's* — `title`,
   * `seo.note` — because the language travels beside it.
   */
  languages: { language: string; set: Record<string, unknown>; unset: string[] }[];
  /** Fields that hold one value, which every language reads. */
  shared: { set: Record<string, unknown>; unset: string[] };
}

export function changedPaths(
  type: SchemaType,
  next: Record<string, unknown>,
  before: Record<string, unknown> | null,
): ChangedPaths {
  const changed: ChangedPaths = { languages: [], shared: { set: {}, unset: [] } };
  compareInto(type.fields, next, before ?? {}, '', changed);
  return changed;
}

function compareInto(
  fields: SchemaField[],
  next: Record<string, unknown> | undefined,
  before: Record<string, unknown> | undefined,
  prefix: string,
  changed: ChangedPaths,
): void {
  if (!next) return;

  for (const field of fields) {
    // A field the form does not hold is not a field being cleared: the form draws the
    // schema's fields, so an absent one is a schema that moved, not a deletion.
    if (!(field.name in next)) continue;

    const path = prefix ? `${prefix}.${field.name}` : field.name;
    const after = next[field.name];
    const was = before?.[field.name];

    if (isLocalizable(field)) {
      compareLanguages(path, after, was, changed);
      continue;
    }

    if (field.type === 'object' && isRecord(after)) {
      compareInto(field.fields ?? [], after, isRecord(was) ? was : undefined, path, changed);
      continue;
    }

    if (!sameValue(after, was)) changed.shared.set[path] = after;
  }
}

/** One language's slot at a time, for a field that holds several. */
function compareLanguages(path: string, after: unknown, was: unknown, changed: ChangedPaths): void {
  const map = isLanguageMap(after) ? after : {};
  const previous = isLanguageMap(was) ? was : {};

  for (const language of new Set([...Object.keys(map), ...Object.keys(previous)])) {
    const value = map[language];
    if (sameValue(value, previous[language])) continue;

    const entry = languageEntry(language, changed);
    if (value === undefined) entry.unset.push(path);
    else entry.set[path] = value;
  }
}

function languageEntry(
  language: string,
  changed: ChangedPaths,
): { language: string; set: Record<string, unknown>; unset: string[] } {
  const found = changed.languages.find((entry) => entry.language === language);
  if (found) return found;

  const entry = { language, set: {}, unset: [] };
  changed.languages.push(entry);
  return entry;
}

/**
 * The languages whose values differ between two versions of a document.
 *
 * This is what makes an approval mean something. An approval is of a particular
 * text, so a write that changes a language has to be able to say *which* language it
 * changed — otherwise an editor fixing an English typo would either void the French
 * approval or, worse, leave the French approval standing over text that had changed
 * underneath it.
 *
 * A walk of the type, and a comparison of the **documents** rather than of the
 * request: a client that sends the whole document back — which is what the studio
 * does — names no language at all, so the only honest answer to "which language
 * changed" is the one that reads both versions of it.
 */
export function changedLanguages(
  type: SchemaType,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  const found = new Set<string>();
  compareFields(type.fields, before, after, found);
  return [...found];
}

function compareFields(
  fields: SchemaField[],
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
  found: Set<string>,
): void {
  for (const field of fields) {
    const was = before?.[field.name];
    const now = after?.[field.name];

    if (isLocalizable(field)) {
      for (const language of languagesIn(was, now)) {
        if (!sameValue(mapValue(was, language), mapValue(now, language))) found.add(language);
      }
      continue;
    }

    switch (field.type) {
      case 'object':
        compareFields(field.fields ?? [], asRecord(was), asRecord(now), found);
        break;
      case 'array':
        compareItems(field, was, now, found);
        break;
      default:
        break;
    }
  }
}

/** A list: one item shape repeated, so index against index. */
function compareItems(field: SchemaField, was: unknown, now: unknown, found: Set<string>): void {
  const before = Array.isArray(was) ? was : [];
  const after = Array.isArray(now) ? now : [];
  const members = field.of ?? [];

  for (let index = 0; index < Math.max(before.length, after.length); index += 1) {
    for (const member of members) {
      if (member.localized) {
        for (const language of languagesIn(before[index], after[index])) {
          if (!sameValue(mapValue(before[index], language), mapValue(after[index], language))) {
            found.add(language);
          }
        }
        continue;
      }
      if (member.type !== 'object') continue;
      compareFields(member.fields ?? [], asRecord(before[index]), asRecord(after[index]), found);
    }
  }
}

/**
 * Every language either version could be in: the keys of a map, and nothing for a
 * value that is not one.
 *
 * A plain value is the default language's, but which language that is is the
 * dataset's business and this function is not given it — so a plain value
 * contributes no language, and a value that *became* a map contributes the keys it
 * has. The comparison then sees `undefined` against the new value, which is a change
 * in the language it landed in, which is the truth.
 */
function languagesIn(was: unknown, now: unknown): string[] {
  const keys = new Set<string>();
  for (const value of [was, now]) {
    if (!isLanguageMap(value)) continue;
    for (const key of Object.keys(value)) keys.add(key);
  }
  return [...keys];
}

function mapValue(value: unknown, language: string): unknown {
  return isLanguageMap(value) ? value[language] : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

/**
 * Whether two stored values say the same thing.
 *
 * Deep and order-insensitive, because `JSON.stringify` is not: a document that came
 * back from a read with its keys in another order would look changed, and the cost of
 * that mistake is an approval quietly withdrawn every time somebody saves.
 */
function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
    return left.every((entry, index) => sameValue(entry, right[index]));
  }
  if (isRecord(left) && isRecord(right)) {
    const names = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const name of names) {
      if (!sameValue(left[name], right[name])) return false;
    }
    return true;
  }
  return false;
}
