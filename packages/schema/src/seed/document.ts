import type { AcharDocument } from '@achar/types';

/**
 * When the seed was authored.
 *
 * A fixed date rather than "now": the seed is sample content standing in for
 * content somebody wrote, and a blog index whose ten posts are all dated the
 * moment the container started is a blog index that reads as a fixture. Posts
 * carry their own `publishedAt` and pass it here, so a post's timestamps agree
 * with the date it claims.
 */
export const SEED_AT = '2025-11-18T09:00:00.000Z';

/**
 * The revision every seeded row carries.
 *
 * One opaque string for the whole seed, because it is a value to compare and
 * never to parse: the API reissues it on the first write, and a different
 * revision per document would suggest a history these rows do not have.
 */
const SEED_REV = 'seed-1';

/** A document row, with the system fields the API owns already in place. */
export function seedDocument(
  id: string,
  type: string,
  fields: Record<string, unknown>,
  at: string = SEED_AT,
): AcharDocument {
  return {
    _id: id,
    _type: type,
    _rev: SEED_REV,
    _createdAt: at,
    _updatedAt: at,
    ...fields,
  };
}

/**
 * What a document stores to point at another one.
 *
 * The `_type` is `'reference'` and not the target's type, because that is what a
 * reference *is*: an id whose meaning is resolved on read, so that renaming a
 * type is not a migration of every document that mentions it.
 */
export function ref(id: string): { _ref: string; _type: 'reference' } {
  return { _ref: id, _type: 'reference' };
}
