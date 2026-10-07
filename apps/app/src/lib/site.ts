/**
 * Where this site is.
 *
 * Read from the environment rather than inferred from the request, because
 * `generateMetadata`, the sitemap and `robots.txt` all have to answer with the
 * same origin and none of them sees the same request object. A metadata base that
 * changes per request is a set of canonical URLs that disagree with each other.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export function absoluteUrl(path = '/'): string {
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
