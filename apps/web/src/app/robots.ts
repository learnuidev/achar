import type { MetadataRoute } from 'next';
import { absoluteUrl, siteUrl } from '@/lib/site';

/**
 * `robots.txt`.
 *
 * Everything is crawlable, including the CMS-driven pages, because there is
 * nothing here that a visitor cannot read — this is a marketing site, and the one
 * rule it needs is where the sitemap is. The `host` line is the canonical origin,
 * which is the same value `generateMetadata` builds its absolute URLs from.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/' }],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: siteUrl(),
  };
}
