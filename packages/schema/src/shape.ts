import type { SchemaField, SchemaType } from '@achar/types';

/**
 * A document as the type that declares it.
 *
 * A stored document is not the type it is written as. The type says
 * `coverImage: Image` and the row holds `{ _ref: 'image-asset_…-1200x800-png' }`; the
 * type says `author: Author` and the row holds `{ _ref: 'muxl6to1-994suy1f' }`. That
 * is right for storage — a reference is what survives the thing it names being
 * renamed, moved or re-uploaded — and it is wrong for delivery, which is the one
 * place those two shapes have to be reconciled: a client that has to resolve an
 * image, dereference an author and know which of its fields are references is a
 * client re-implementing this package.
 *
 * So this answers the document **as the type declares it**:
 *
 * | Declared | Answered |
 * | --- | --- |
 * | `Image`, `Video`, `File` | the address, as a string |
 * | `Author` (a reference) | the author document, resolved |
 * | `{ … }` | the same, field by field |
 * | `T[]` | the same, item by item |
 * | everything else | unchanged |
 *
 * Two rules keep it predictable. **A field the type does not declare is left
 * alone**, because a schema is not a filter and a value nobody declared is still
 * somebody's content. And **a reference that resolves to nothing is `null`** — a
 * deleted author, an asset with no row — because there is no entity to answer with,
 * and a reference string where a document was promised is what makes a client crash
 * on `author.name`. A caller that wants the reference can ask for the stored shape.
 *
 * The resolver is what decides the depth: a `reference` function is how far this
 * walks, so the delivery path resolves the document's own references one level and
 * hands each resolved entity back through this function *without* one — the
 * entity's assets become addresses and its own references stay references. That
 * bound is the difference between a page of posts and a page of everything they
 * mention.
 *
 * It is pure, and it is here rather than in the API because it is a statement about
 * the content model rather than about a handler: the schema is the thing that knows
 * what a field is, and this is the only other place that has to.
 */
export interface ShapeResolvers {
  /** The address of an asset reference — `image-…` — when the deployment has a row for it. */
  assetUrl: (reference: string) => string | undefined;
  /**
   * The document a reference points at, already shaped.
   *
   * Absent means "do not dereference", which is how a resolved entity is shaped
   * without resolving what *it* points at: one level, by construction.
   */
  reference?: (id: string) => unknown;
}

export function shapeDocument(
  type: SchemaType,
  document: Record<string, unknown>,
  resolvers: ShapeResolvers,
): Record<string, unknown> {
  const declared = new Map(type.fields.map((field) => [field.name, field]));
  const shaped: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(document)) {
    const field = declared.get(name);
    shaped[name] = field ? shapeField(field, value, resolvers) : value;
  }

  return shaped;
}

/** One declared field's value, as the field says it holds. */
export function shapeField(field: SchemaField, value: unknown, resolvers: ShapeResolvers): unknown {
  if (value === undefined || value === null) return null;

  switch (field.type) {
    case 'image':
    case 'video':
    case 'file':
      return addressOf(value, resolvers);

    case 'reference':
      return entityOf(value, resolvers);

    case 'object':
      return isRecord(value) ? shapeObject(field.fields ?? [], value, resolvers) : value;

    case 'array': {
      if (!Array.isArray(value)) return value;
      const item = (field.of ?? [])[0];
      // An item shape is one shape in this model, so a list is that shape applied
      // to every member. A list with no item shape declared is left as it is.
      return item ? value.map((entry) => shapeField(item, entry, resolvers)) : value;
    }

    default:
      // Everything else — strings, numbers, dates, rich text, a picker's options —
      // is already what the type says it is. Rich text is a format rather than a
      // value, and its blocks are nobody's to reshape.
      return value;
  }
}

function shapeObject(
  fields: SchemaField[],
  value: Record<string, unknown>,
  resolvers: ShapeResolvers,
): Record<string, unknown> {
  const declared = new Map(fields.map((field) => [field.name, field]));
  const shaped: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(value)) {
    const field = declared.get(name);
    shaped[name] = field ? shapeField(field, entry, resolvers) : entry;
  }
  return shaped;
}

/** The address an asset field holds, or `null` when there is no row behind it. */
function addressOf(value: unknown, resolvers: ShapeResolvers): string | null {
  // A document may hold the address already — a migration that wrote one, or a
  // value that has been through this function. It is the answer either way.
  if (typeof value === 'string') return value.startsWith('http') ? value : (resolvers.assetUrl(value) ?? null);

  const reference = isRecord(value) ? value._ref : undefined;
  if (typeof reference !== 'string' || reference === '') return null;
  return resolvers.assetUrl(reference) ?? null;
}

/** The document a reference field holds, or `null` when there is nothing to answer with. */
function entityOf(value: unknown, resolvers: ShapeResolvers): unknown {
  if (!resolvers.reference) return value;

  const id = referenceIdOf(value);
  if (!id) return null;

  return resolvers.reference(id) ?? null;
}

/** The document id a reference names, however it is written. */
export function referenceIdOf(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  if (!isRecord(value)) return null;
  const id = value._ref ?? value._id;
  return typeof id === 'string' && id !== '' ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
