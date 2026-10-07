import type { DatasetSchema, SchemaField, SchemaType } from '@achar/types';

/**
 * The types a dataset authors, in the order the schema declares them.
 *
 * `kind: 'object'` types are left out because they are not documents anybody
 * writes — they exist to be a field of one — and a sidebar that listed them would
 * be offering an empty list of something that cannot have a list.
 */
export function documentTypes(schema: DatasetSchema): SchemaType[] {
  return schema.types.filter((type) => type.kind === 'document');
}

/**
 * The field at a dotted path, or nothing.
 *
 * Descends through object fields and through the item shape of an array, which are
 * the two ways a path goes deeper: `author.links.label` reads a field of a link,
 * and both halves of that are ordinary declarations rather than a second kind of
 * path. A path that runs out of fields is `undefined` rather than an error,
 * because the caller is usually a form asking whether it should draw something.
 */
export function fieldByPath(type: SchemaType, path: string): SchemaField | undefined {
  const segments = path.split('.');
  let fields = type.fields;

  for (const [index, segment] of segments.entries()) {
    const field = fields.find((candidate) => candidate.name === segment);
    if (!field) return undefined;
    if (index === segments.length - 1) return field;

    const nested = field.type === 'object' ? field.fields : field.of?.[0]?.fields;
    if (!nested) return undefined;
    fields = nested;
  }

  return undefined;
}
