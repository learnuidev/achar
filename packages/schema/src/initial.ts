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
 */
export function initialDocument(type: SchemaType): Record<string, unknown> {
  const document: Record<string, unknown> = { _type: type.name };
  for (const field of type.fields) {
    document[field.name] = initialValue(field);
  }
  return document;
}

function initialValue(field: SchemaField): unknown {
  if (field.initialValue !== undefined) return field.initialValue;

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
      return initialObject(field);
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

function initialObject(field: SchemaField): Record<string, unknown> {
  const object: Record<string, unknown> = {};
  for (const sub of field.fields ?? []) {
    object[sub.name] = sub.initialValue !== undefined ? sub.initialValue : initialValue(sub);
  }
  return object;
}
