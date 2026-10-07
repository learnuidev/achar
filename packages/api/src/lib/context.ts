/**
 * What a module is handed to make a request with.
 *
 * The client owns the token, the base URL and the error envelope; a module owns
 * one area's routes. Keeping the two apart is what lets the forty methods below
 * live in nine files instead of one seven-hundred-line class — each module is a
 * list of routes and nothing else, and the only thing crossing between them is
 * this interface.
 */
export interface ApiContext {
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  get: <T>(path: string) => Promise<T>;
  post: <T>(path: string, body?: unknown) => Promise<T>;
  patch: <T>(path: string, body?: unknown) => Promise<T>;
  put: <T>(path: string, body?: unknown) => Promise<T>;
  del: <T>(path: string) => Promise<T>;
}

/**
 * A path segment, escaped.
 *
 * Ids are ids and usually need nothing, but a pending member's id **is** their
 * email address until they accept — that is how an invitation is keyed to
 * somebody the pool has never heard of — and an unescaped `@` in a path is a
 * request that reaches the wrong route or none at all.
 */
export function segment(value: string): string {
  return encodeURIComponent(value);
}

/** A query string from the parts of a request that were actually given. */
export function queryString(entries: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}
