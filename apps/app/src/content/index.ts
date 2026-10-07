/**
 * The content layer.
 *
 * Every page on this site reads through the functions below and never through a
 * client, a fetch or a seed array. That is the whole design: the page asks for
 * "the features", and whether they came from a live dataset over GROQ or from the
 * corpus in `@achar/schema` is not a question the page can ask, let alone answer.
 *
 * ## The fallback is the point
 *
 * Each function tries the API when one is configured, and falls back to
 * `seedDocuments()` when one is not — or when the request fails. The reason is
 * stated once, here: **a failed request must never take the site down with it.**
 * The copy this site publishes already exists in this repository, so the honest
 * answer to "the content API is unreachable" is the copy we last shipped, on a
 * page that renders, rather than a 500 that tells a visitor nothing. One line
 * goes to the server log saying which query failed and why; nothing goes to the
 * visitor.
 *
 * ## Caching
 *
 * Reads are wrapped in `unstable_cache` with a revalidation window rather than
 * being left dynamic. Content changes when an editor presses publish — minutes or
 * hours apart — not when a page is requested, so a per-request read of a dataset
 * that has not moved is pure latency on the critical path of the front page. The
 * window is what lets a publish show up without a redeploy without turning every
 * page view into a query.
 */

import { unstable_cache } from 'next/cache';
import { seedDocuments } from '@achar/schema';
import type { AcharDocument } from '@achar/types';
import { contentClient, contentDataset, contentProject } from '@/content/client';
import {
  asDocuments,
  resolvePost,
  toAuthor,
  toCategory,
  toCustomer,
  toFaq,
  toFeature,
  toIntegration,
  toPage,
  toPost,
  toPricingPlan,
  toSiteSettings,
  type Author,
  type Category,
  type CmsPage,
  type Customer,
  type Faq,
  type Feature,
  type Integration,
  type Post,
  type PricingPlan,
  type SiteSettings,
} from '@/content/types';

export * from '@/content/types';

/** Five minutes. See the note on caching above — this is a publish window, not a TTL. */
const REVALIDATE_SECONDS = 300;

/** One tag for the whole corpus, so a webhook or a revalidate route can drop all of it at once. */
const CONTENT_TAG = 'achar-content';

// ─────────────────────────────────────────────────────────────────────────────
// The two sources
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The queries themselves, cached by argument.
 *
 * `unstable_cache` keys on the function's arguments, so the dataset and the query
 * text are the key — which is what makes it safe to have one cached function
 * behind eleven readers.
 */
const runQuery = unstable_cache(
  async (
    projectId: string,
    dataset: string,
    query: string,
    params: Record<string, unknown>,
  ): Promise<unknown> => {
    const client = contentClient();
    if (!client) return [];
    const answer = await client.query<unknown>(projectId, dataset, {
      query,
      params,
      perspective: 'published',
    });
    return answer.result;
  },
  ['achar-content-query'],
  { revalidate: REVALIDATE_SECONDS, tags: [CONTENT_TAG] },
);

/**
 * The corpus that ships with the repository.
 *
 * Read through `seedDocuments()` rather than a JSON file beside this one, because
 * the seed is the same documents the studio edits and the API stores — the
 * content model has one definition, and a copy of it here would be a second one
 * to keep in step.
 */
function seedCorpus(): AcharDocument[] {
  const seeded: unknown = seedDocuments();
  // `seedDocuments()` is the dataset's documents; the envelope is tolerated
  // because an export of the whole dataset (`DatasetExport`) is the other shape a
  // corpus arrives in, and a site that renders nothing because it was handed
  // `{ documents: [...] }` is a site nobody can debug from the outside.
  if (Array.isArray(seeded)) return asDocuments(seeded);
  const envelope = typeof seeded === 'object' && seeded !== null ? (seeded as Record<string, unknown>) : {};
  return asDocuments(envelope.documents);
}

function seedOfType(type: string): AcharDocument[] {
  return seedCorpus().filter((document) => document._type === type);
}

/**
 * Documents of one type: from the API when there is one, from the seed otherwise.
 *
 * The `catch` is deliberately broad. An absent client, a refused token, a
 * timeout, a dataset that has not been provisioned — every one of them means the
 * same thing to a page, which is "draw the copy you already have".
 */
async function documentsOfType(
  type: string,
  query: string,
  params: Record<string, unknown> = {},
): Promise<AcharDocument[]> {
  const client = contentClient();
  const projectId = contentProject();

  if (client && projectId) {
    try {
      return asDocuments(await runQuery(projectId, contentDataset(), query, params));
    } catch (error) {
      console.warn(
        `[content] query for \`${type}\` failed, serving the seed corpus instead — ${describe(error)}`,
      );
    }
  } else if (client) {
    // Half a configuration is worth a line of its own: an API URL with no project
    // is a deployment somebody meant to finish, and it looks exactly like a site
    // that has never been connected.
    console.warn(
      `[content] NEXT_PUBLIC_ACHAR_API_URL is set but NEXT_PUBLIC_ACHAR_PROJECT is not, so there is nowhere to read \`${type}\` from — serving the seed corpus`,
    );
  }

  return seedOfType(type);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The seed's own ordering, for a corpus read through it rather than through GROQ. */
function byOrder<T extends { order: number }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.order - right.order);
}

function narrow<T>(documents: AcharDocument[], convert: (document: AcharDocument) => T | null): T[] {
  return documents.map(convert).filter((item): item is T => item !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// The readers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The frame's own copy: the title, the tagline, the two calls to action.
 *
 * Falls back to a written-in default when there is no document at all, because a
 * site with no `siteSettings` document is a site with no header — and the one
 * thing this layer may never do is leave the page blank.
 */
export async function getSiteSettings(): Promise<SiteSettings> {
  const documents = await documentsOfType('siteSettings', '*[_type == "siteSettings"][0]');
  const settings = toSiteSettings(documents[0] ?? seedOfType('siteSettings')[0]);
  return (
    settings ?? {
      title: 'Achar',
      description: 'A structured-content platform: a content lake, a query language, and a studio.',
      tagline: 'The Content Operating System',
      primaryCta: { label: 'Start building', href: '/product' },
      secondaryCta: { label: 'Book a demo', href: '/pricing' },
    }
  );
}

export async function getFeatures(): Promise<Feature[]> {
  const documents = await documentsOfType('feature', '*[_type == "feature"] | order(order asc)');
  return byOrder(narrow(documents, toFeature));
}

export async function getCustomers(): Promise<Customer[]> {
  const documents = await documentsOfType('customer', '*[_type == "customer"] | order(order asc)');
  return byOrder(narrow(documents, toCustomer));
}

export async function getPricingPlans(): Promise<PricingPlan[]> {
  const documents = await documentsOfType('pricingPlan', '*[_type == "pricingPlan"] | order(order asc)');
  return byOrder(narrow(documents, toPricingPlan));
}

export async function getFaqs(): Promise<Faq[]> {
  const documents = await documentsOfType('faq', '*[_type == "faq"] | order(order asc)');
  return byOrder(narrow(documents, toFaq));
}

export async function getIntegrations(): Promise<Integration[]> {
  const documents = await documentsOfType('integration', '*[_type == "integration"] | order(order asc)');
  return byOrder(narrow(documents, toIntegration));
}

export async function getAuthors(): Promise<Author[]> {
  const documents = await documentsOfType('author', '*[_type == "author"] | order(name asc)');
  return narrow(documents, toAuthor);
}

export async function getCategories(): Promise<Category[]> {
  const documents = await documentsOfType('category', '*[_type == "category"] | order(title asc)');
  return narrow(documents, toCategory);
}

/**
 * Every post, newest first, with its author and categories resolved.
 *
 * The references are resolved here rather than in each reader so that a post card
 * never has to know that an author is a reference: `getPosts()` and `getPost()`
 * both answer a `Post` whose `author` is an `Author`, and the two lists it joins
 * against are themselves cached reads of the same corpus.
 */
export async function getPosts(): Promise<Post[]> {
  const [documents, authors, categories] = await Promise.all([
    documentsOfType('post', '*[_type == "post"] | order(publishedAt desc)'),
    getAuthors(),
    getCategories(),
  ]);

  const records = narrow(documents, toPost).sort(byPublishedAtDesc);
  const authorsById = new Map(authors.map((author) => [author.id, author]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));

  return records.map((record) => resolvePost(record, authorsById, categoriesById));
}

/**
 * Newest first, with an undated post last.
 *
 * A draft that has never been published has no date at all, and sorting it to the
 * top of a blog — which is what a naive string compare does with `undefined` —
 * would publish it by accident.
 */
function byPublishedAtDesc(left: { publishedAt?: string }, right: { publishedAt?: string }): number {
  return (right.publishedAt ?? '').localeCompare(left.publishedAt ?? '');
}

export async function getPost(slug: string): Promise<Post | null> {
  const posts = await getPosts();
  return posts.find((post) => post.slug === slug) ?? null;
}

/**
 * A `page` document by slug.
 *
 * `$slug` is a parameter rather than an interpolated string: the slug comes
 * straight off the URL, and a query assembled by concatenation is a query a
 * visitor can rewrite.
 *
 * Both spellings of the field are tested because both are in use: GROQ's `slug`
 * type nests the string under `current`, and the seed corpus — which is exactly
 * what the seed script pushes into a real dataset — stores a plain string. Asking
 * for both costs one clause and removes a class of failure where the document
 * exists and the route that serves it insists it does not.
 *
 * The `find` at the end is not redundant. Against a live dataset the query has
 * already narrowed to one document; against the seed corpus there was no query at
 * all, and every page came back — so the filter has to exist for the path where
 * the whole point of this layer is that nobody can tell the difference.
 */
export async function getPage(slug: string): Promise<CmsPage | null> {
  const documents = await documentsOfType(
    'page',
    '*[_type == "page" && (slug == $slug || slug.current == $slug)][0]',
    { slug },
  );
  return narrow(documents, toPage).find((page) => page.slug === slug) ?? null;
}

/** Every page document, for the sitemap — a route somebody added in the studio. */
export async function getPages(): Promise<CmsPage[]> {
  const documents = await documentsOfType('page', '*[_type == "page"]');
  return narrow(documents, toPage);
}
