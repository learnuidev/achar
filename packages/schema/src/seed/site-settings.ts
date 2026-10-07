import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The site's own settings document, at the one id a site looks for.
 *
 * `siteSettings` rather than a generated id, because it is a singleton: a front
 * page that had to query for "the newest settings document" would be a front page
 * that renders differently depending on what was authored most recently.
 */
export const seedSiteSettings: AcharDocument[] = [
  seedDocument('siteSettings', 'siteSettings', {
    title: 'Achar',
    tagline: 'The content operating system',
    description:
      'Achar is a content lake, a query language, and a studio: one place to model your content, one API to read it from anywhere, and a publishing flow your editors can follow without a deploy.',
    announcement: 'Achar 2.0 is out — GROQ projections, draft previews, and a schema-aware studio.',
    primaryCta: { label: 'Start free', href: '/sign-up' },
    secondaryCta: { label: 'Read the docs', href: '/docs' },
  }),
];
