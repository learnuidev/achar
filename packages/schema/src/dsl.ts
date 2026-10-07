import type { SchemaField, SchemaType } from '@achar/types';

/**
 * A field, with the defaults applied.
 *
 * An identity function apart from the defaults, which is the whole reason it
 * exists: a schema is written by hand in one place and read back off the wire in
 * another, and the two spellings have to come out the same. `required: false`
 * written out rather than left off means a studio editor, a validator and a
 * seed script all see one shape instead of three versions of "absent".
 */
export function defineField(field: SchemaField): SchemaField {
  return {
    ...field,
    required: field.required ?? false,
    hidden: field.hidden ?? false,
    ...(field.fields ? { fields: field.fields.map(defineField) } : {}),
    ...(field.of ? { of: field.of.map(defineField) } : {}),
  };
}

/**
 * A type, with its defaults applied — and its fields through `defineField`.
 *
 * `kind` defaults to `'document'` rather than being demanded of every caller,
 * because it is the answer for all but the handful of object types a schema
 * declares, and a type that forgot to say so should be authored rather than
 * silently missing from the studio's sidebar.
 */
export function defineType(type: SchemaType): SchemaType {
  return {
    ...type,
    kind: type.kind ?? 'document',
    fields: type.fields.map(defineField),
  };
}
