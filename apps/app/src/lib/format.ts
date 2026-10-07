/**
 * Turning a stored value into something a person reads.
 *
 * Time is the one that matters here: a studio is a list of documents sorted by
 * when somebody last touched them, and "3 minutes ago" is the answer to the
 * question that list is asked. The absolute stamp is kept beside it wherever a
 * precise moment is the point.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** `just now`, `12 minutes ago`, `3 days ago`, and the date once a month has passed. */
export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'unknown';

  const elapsed = now - then;
  if (elapsed < 0) return 'just now';
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return plural(Math.floor(elapsed / MINUTE), 'minute') + ' ago';
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour') + ' ago';
  if (elapsed < 30 * DAY) return plural(Math.floor(elapsed / DAY), 'day') + ' ago';
  return formatDate(iso);
}

/** `4 Mar 2025` — the date without a clock, for a list. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `4 Mar 2025, 14:06` — the stamp a system field panel shows. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** The value a `datetime-local` input needs, in the reader's own zone. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** The value a `date` input needs. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A byte count, because an asset library is read in sizes. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

export function plural(count: number, one: string, many?: string): string {
  return `${count} ${count === 1 ? one : (many ?? `${one}s`)}`;
}

/** `Post`, `a post` — a type name as a person writes it in a sentence. */
export function humanizeType(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** `coverImage` → `Cover image`. The fallback title for a field the schema gives none. */
export function humanizeField(name: string): string {
  const spaced = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** A short, stable, human-typable id, used for new documents and blocks. */
export function randomKey(length = 12): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out;
}

/**
 * A date, written out for a reader of the site — "5 January 2026".
 *
 * The studio's `formatDate` is the short one a table column needs, and this is
 * the long one a byline needs; they are two formatters rather than one with a
 * flag because a date that is right in a table is wrong on a page and a boolean
 * argument would be the only thing telling them apart at a call site.
 *
 * Built once: `Intl.DateTimeFormat` construction is not free, and a list of
 * twenty post cards is twenty of them if each card makes its own. The locale is
 * pinned rather than taken from the request — the same post rendered during a
 * build and served from a cache should say the same thing.
 */
const LONG_DATE = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatLongDate(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return LONG_DATE.format(date);
}
