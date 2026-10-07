import type { Asset } from '@achar/types';

/** How an image should be transformed on the way out of the CDN. */
export interface ImageUrlOptions {
  width?: number;
  height?: number;
  quality?: number;
  fit?: 'clip' | 'crop' | 'fill' | 'max';
}

/**
 * An asset's URL, with transform parameters.
 *
 * The transforms are query parameters rather than stored variants: one uploaded
 * image serves a thumbnail, a card and a hero, and changing the sizes later is a
 * change to a page rather than a re-run of an image pipeline. The names are the
 * CDN's, not this package's — `w`, `h`, `q` and `fit` are what the media stack's
 * distribution reads, and renaming them here would only move the translation
 * somewhere else.
 *
 * `asset.url` is built on read, so a distribution that moves does not orphan the
 * documents pointing at it; anything already in the URL — a signature, a version
 * — is kept, which is why the separator is decided rather than assumed.
 */
export function imageUrl(asset: Asset, opts: ImageUrlOptions = {}): string {
  const params = new URLSearchParams();
  if (opts.width !== undefined) params.set('w', String(Math.round(opts.width)));
  if (opts.height !== undefined) params.set('h', String(Math.round(opts.height)));
  if (opts.quality !== undefined) params.set('q', String(Math.round(opts.quality)));
  if (opts.fit) params.set('fit', opts.fit);

  const query = params.toString();
  if (query === '') return asset.url;
  return `${asset.url}${asset.url.includes('?') ? '&' : '?'}${query}`;
}
