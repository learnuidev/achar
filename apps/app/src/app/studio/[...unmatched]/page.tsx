import { notFound } from 'next/navigation';

/**
 * A studio path that names nothing.
 *
 * Without this, an unmatched `/studio/...` falls to the site's own catch-all and
 * a person who mistyped a project id is shown the marketing site's 404 — a page
 * offering Pricing and the blog to somebody who was looking for a document. This
 * one segment is the difference between the two 404s landing in the surface they
 * belong to.
 */
export default function UnmatchedStudioPath(): never {
  notFound();
}
