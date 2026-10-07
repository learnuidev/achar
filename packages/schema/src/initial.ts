import type { SchemaField, SchemaType } from '@achar/types';

/**
 * A new document of a type, with every field present.
 *
 * Every field rather than only the required ones: a studio's editor is drawn from
 * this object, and a field that is absent is a field whose control is uncontrolled
 * — which in React is the difference between an empty input and one that keeps
 * re-typing its own first character. So a string is `''`, a number is `0`, and a
 * list is `[]`, and `initialValue` overrides any of them where the schema says so.
 *
 * `_id` and `_rev` are deliberately not set: they belong to whatever writes the
 * document, and a client that invented one would be deciding an identity the API
 * is about to reissue.
 *
 * A **localized** field starts with the default language's empty value and nothing
 * else — `{ en: '' }` rather than `{ en: '', fr: '' }`. The other languages are
 * absent because absent is what "nobody has translated this yet" looks like, and a
 * document that arrived with every language blank could not be told from one
 * somebody had emptied on purpose.
 */
export function initialDocument(
  type: SchemaType,
  options: { defaultLanguage?: string } = {},
): Record<string, unknown> {
  const document: Record<string, unknown> = { _type: type.name };
  for (const field of type.fields) {
    document[field.name] = initialValue(field, options.defaultLanguage);
  }
  return document;
}

function initialValue(field: SchemaField, defaultLanguage: string | undefined): unknown {
  if (field.initialValue !== undefined) {
    // An `initialValue` on a localized field is the value in the default language,
    // for the same reason a plain value sent over the API is: nobody writes a
    // translation into a schema as the thing every new document starts with.
    return field.localized && defaultLanguage ? { [defaultLanguage]: field.initialValue } : field.initialValue;
  }

  const empty = emptyValue(field, defaultLanguage);
  if (!field.localized) return empty;
  return defaultLanguage ? { [defaultLanguage]: empty } : {};
}

function emptyValue(field: SchemaField, defaultLanguage: string | undefined): unknown {
  switch (field.type) {
    case 'string':
    case 'text':
    case 'slug':
    case 'url':
    case 'email':
    case 'datetime':
    case 'date':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
    case 'portableText':
      return [];
    case 'object':
      return initialObject(field, defaultLanguage);
    case 'image':
    case 'video':
    case 'file':
    case 'reference':
      // `null` rather than `''`: the editors for these three store references,
      // and an empty string in a reference field is a reference to a document
      // whose id is empty.
      return null;
  }
}

function initialObject(field: SchemaField, defaultLanguage: string | undefined): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const sub of field.fields ?? []) {
    object[sub.name] = initialValue(sub, defaultLanguage);
  }
  return object;
}
