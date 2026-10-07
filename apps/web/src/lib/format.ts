/**
 * Dates for the blog.
 *
 * One formatter, built once: `Intl.DateTimeFormat` construction is not free, and
 * a list of twenty post cards is twenty of them if each card makes its own. The
 * locale is pinned rather than taken from the request — the same post rendered
 * during a build and served from a cache should say the same thing, and a date
 * that changes with the visitor's `Accept-Language` is a date that disagrees with
 * the `<time datetime>` beside it.
 */
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return DATE_FORMAT.format(date);
}
