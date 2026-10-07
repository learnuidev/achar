import type { AcharDocument } from '@achar/types';

import { seedAuthors } from './authors';
import { seedCategories } from './categories';
import { seedCustomers } from './customers';
import { seedFaqs } from './faqs';
import { seedFeatures } from './features';
import { seedIntegrations } from './integrations';
import { seedPages } from './pages';
import { seedPosts } from './posts';
import { seedPricingPlans } from './pricing-plans';
import { seedSiteSettings } from './site-settings';

/**
 * Achar's own site content, as documents.
 *
 * Plain JSON-serialisable data typed as `AcharDocument`, and it is used from two
 * places that cannot share a runtime: `apps/app` renders it as a fallback when no
 * API is configured — so the site is never a blank page — and
 * `services/api/scripts/seed.mjs` pushes the same array into a dataset over the
 * HTTP API. One array, two ways of reading it, which is why nothing here is a
 * class, a function or a lazy getter.
 *
 * The order is the order the types are declared in the schema: settings first,
 * then the documents other documents point at, then the ones that point at them.
 *
 * `seedPages` is what makes the site's own footer links resolve. Every href in
 * `site-footer.tsx` — `/about`, `/security`, `/privacy`, `/terms`,
 * `/sub-processors`, `/status`, `/careers`, `/contact` — plus the two calls to
 * action in the settings document is a `page` document here, so the `[slug]`
 * route has something to render and nothing 404s.
 */
export function seedDocuments(): AcharDocument[] {
  return [
    ...seedSiteSettings,
    ...seedAuthors,
    ...seedCategories,
    ...seedPosts,
    ...seedPages,
    ...seedCustomers,
    ...seedFeatures,
    ...seedPricingPlans,
    ...seedFaqs,
    ...seedIntegrations,
  ];
}
