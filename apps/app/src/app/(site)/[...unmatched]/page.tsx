import { notFound } from 'next/navigation';

/**
 * Nothing in the site is published at a path this deep.
 *
 * The site's content is one segment — `/[slug]` — so an unmatched path with two
 * or more of them would otherwise fall past the site's layout and render Next's
 * built-in 404, with no header, no footer and none of the site's voice. This
 * exists to bring those paths back inside the surface they belong to, and it
 * does it the only way a route can ask for a 404: by throwing the one Next knows
 * how to catch, so `not-found.tsx` beside this file is what a visitor sees.
 *
 * It does not swallow the studio: `/studio` is a static segment and wins against
 * a catch-all, so an unmatched path under the studio stays in the studio and
 * renders the studio's own 404.
 */
export default function UnmatchedSitePath(): never {
  notFound();
}
