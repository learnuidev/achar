/**
 * The site's own view of the corpus.
 *
 * `@achar/types` describes a *document*: an open record with a `_type` and
 * whatever fields its schema declares. That openness is the point of the system
 * — a dataset is authored against a schema, not against this file — and it is
 * also why nothing in `src/components` should read `document.someField` and hope.
 *
 * So the boundary is here. `AcharDocument` comes in, these shapes go out, and the
 * narrowing happens once, in one place, with a fallback for every field a page
 * dereferences. A document missing a title is not a `Feature` with an undefined
 * title; it is not a `Feature`, and the page draws the ones that are.
 */

import type { AcharDocument, PortableText } from '@achar/types';

// ─────────────────────────────────────────────────────────────────────────────
// The shapes the pages render
// ─────────────────────────────────────────────────────────────────────────────

/** A place a button goes, from `siteSettings`, a plan or an author. */
export interface Cta {
  label: string;
  href: string;
}

/** One `siteSettings` document, with every field the frame needs. */
export interface SiteSettings {
  title: string;
  description: string;
  tagline: string;
  primaryCta: Cta;
  secondaryCta: Cta;
  /** Set while there is something to announce; absent the rest of the time. */
  announcement?: string;
}

/** The three things a feature can be about, which is how the grid groups them. */
export type FeatureGroup = 'content' | 'platform' | 'ai';

/** The groups, in the order the grid draws them. */
export const FEATURE_GROUPS: readonly FeatureGroup[] = ['content', 'platform', 'ai'];

/** What each group is called on the page, and what it is about. */
export const FEATURE_GROUP_TITLES: Record<FeatureGroup, string> = {
  content: 'Content',
  platform: 'Platform',
  ai: 'AI',
};

export interface Feature {
  id: string;
  title: string;
  description: string;
  /** A lucide icon name, resolved through the registry in `components/content/icon.tsx`. */
  icon?: string;
  group: FeatureGroup;
  order: number;
}

/** A number a customer is willing to have quoted beside their name. */
export interface Metric {
  label: string;
  value: string;
}

export interface Customer {
  id: string;
  name: string;
  industry?: string;
  quote: string;
  quoteAuthor?: string;
  metrics: Metric[];
  order: number;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted: boolean;
  order: number;
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
  order: number;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  category?: string;
  order: number;
}

export interface Author {
  id: string;
  name: string;
  role?: string;
  bio?: string;
  avatar?: string;
  links: Cta[];
}

export interface Category {
  id: string;
  title: string;
  slug: string;
  description?: string;
}

export interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  coverImage?: string;
  /** ISO 8601. Absent until it is published, which is why the sort tolerates it. */
  publishedAt?: string;
  /** Resolved from the reference in the corpus, so a card never renders an id. */
  author?: Author;
  categories: Category[];
  body: PortableText;
  featured: boolean;
}

/**
 * A post as it comes out of a document, before its references are resolved.
 *
 * Kept separate from `Post` because a reference and the thing it points at are
 * two different reads: the corpus is narrowed once, then the authors and
 * categories it names are looked up in the lists already fetched. One pass over
 * the documents, no per-post round trip, and no post rendering `author: {_ref}`.
 */
export interface PostRecord extends Omit<Post, 'author' | 'categories'> {
  authorId?: string;
  categoryIds: string[];
}

/** A `page` document: a route somebody added in the studio rather than in git. */
export interface CmsPage {
  id: string;
  title: string;
  slug: string;
  body: PortableText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading one field off a document
// ─────────────────────────────────────────────────────────────────────────────

/** A document, or `null` if what arrived is not one. */
export function asDocument(value: unknown): AcharDocument | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate._id !== 'string' || typeof candidate._type !== 'string') return null;
  return candidate as AcharDocument;
}

/** Every document in an unknown payload, which is what a query result is. */
export function asDocuments(value: unknown): AcharDocument[] {
  if (!Array.isArray(value)) return [];
  return value.map(asDocument).filter((document): document is AcharDocument => document !== null);
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/** A field that the page needs. An empty string counts as absent. */
function text(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value.trim().length > 0 ? value : fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function optionalText(value: unknown): string | undefined {
  const value_ = text(value);
  return value_.length > 0 ? value_ : undefined;
}

function number(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function flag(value: unknown): boolean {
  return value === true;
}

function texts(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => text(item)).filter((item) => item.length > 0);
}

/**
 * The address of an image field, whichever of the three shapes it arrived in.
 *
 * A document stores a reference (`image-<assetId>-<w>x<h>-<ext>`) and the CDN
 * turns that into bytes; but a corpus seeded by hand, or a projection written by
 * somebody in a hurry, may carry a plain URL instead. Both are an image, and the
 * page should draw either rather than a broken frame.
 */
export function imageUrl(value: unknown): string | undefined {
  if (typeof value === 'string') return looksLikeUrl(value) ? value : undefined;
  const field = record(value);
  const url = field.url ?? record(field.asset).url;
  if (typeof url === 'string' && looksLikeUrl(url)) return url;
  const reference = text(record(field.asset)._ref, text(field._ref));
  if (reference.length === 0) return undefined;
  const cdn = process.env.NEXT_PUBLIC_ACHAR_CDN_URL;
  return cdn ? `${cdn.replace(/\/$/, '')}/${reference}` : undefined;
}

function looksLikeUrl(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/');
}

/** A link, which is either `{label, href}` or an absolute address on its own. */
function cta(value: unknown, fallbackLabel: string, fallbackHref: string): Cta {
  if (typeof value === 'string') return { label: fallbackLabel, href: value };
  const field = record(value);
  return {
    label: text(field.label, fallbackLabel),
    href: text(field.href, fallbackHref),
  };
}

/** The `_ref` of a reference field, whether it was dereferenced or not. */
function referenceId(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length > 0 ? value : undefined;
  const field = record(value);
  // A dereferenced document carries `_id`; an unresolved reference carries `_ref`.
  const id = text(field._id, text(field._ref));
  return id.length > 0 ? id : undefined;
}

function references(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(referenceId).filter((id): id is string => id !== undefined);
}

/**
 * A slug, whichever way it was written.
 *
 * GROQ's `slug` type is an object with a `current` field, and a hand-seeded
 * corpus is a plain string. Both are a slug, and a 404 for a page that exists is
 * too expensive a way to learn which one a dataset uses.
 */
function slug(value: unknown, fallback: string): string {
  const field = record(value);
  return text(field.current, text(value, fallback));
}

// ─────────────────────────────────────────────────────────────────────────────
// One document, narrowed
// ─────────────────────────────────────────────────────────────────────────────

/** Every narrowing below starts here, so the `_type` check is written once. */
function ofType(document: AcharDocument, type: string): boolean {
  return document._type === type;
}

export function toSiteSettings(document: AcharDocument | undefined): SiteSettings | null {
  if (!document || !ofType(document, 'siteSettings')) return null;
  return {
    title: text(document.title, 'Achar'),
    description: text(document.description, 'Structured content, queried and delivered everywhere.'),
    tagline: text(document.tagline, 'The Content Operating System'),
    primaryCta: cta(document.primaryCta, 'Start building', '/product'),
    secondaryCta: cta(document.secondaryCta, 'Book a demo', '/pricing'),
    announcement: optionalText(document.announcement),
  };
}

export function toFeature(document: AcharDocument): Feature | null {
  if (!ofType(document, 'feature')) return null;
  const title = text(document.title);
  if (title.length === 0) return null;
  const group = text(document.group);
  return {
    id: document._id,
    title,
    description: text(document.description),
    icon: optionalText(document.icon),
    group: isFeatureGroup(group) ? group : 'platform',
    order: number(document.order, Number.MAX_SAFE_INTEGER),
  };
}

function isFeatureGroup(value: string): value is FeatureGroup {
  return (FEATURE_GROUPS as readonly string[]).includes(value);
}

export function toCustomer(document: AcharDocument): Customer | null {
  if (!ofType(document, 'customer')) return null;
  const name = text(document.name);
  if (name.length === 0) return null;
  return {
    id: document._id,
    name,
    industry: optionalText(document.industry),
    quote: text(document.quote),
    quoteAuthor: optionalText(document.quoteAuthor),
    metrics: metrics(document.metrics),
    order: number(document.order, Number.MAX_SAFE_INTEGER),
  };
}

function metrics(value: unknown): Metric[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const field = record(item);
      const label = text(field.label);
      const value_ = text(field.value);
      return label.length > 0 && value_.length > 0 ? { label, value: value_ } : null;
    })
    .filter((metric): metric is Metric => metric !== null);
}

export function toPricingPlan(document: AcharDocument): PricingPlan | null {
  if (!ofType(document, 'pricingPlan')) return null;
  const name = text(document.name);
  if (name.length === 0) return null;
  return {
    id: document._id,
    name,
    price: text(document.price),
    period: optionalText(document.period),
    description: text(document.description),
    features: texts(document.features),
    ctaLabel: text(document.ctaLabel, 'Get started'),
    ctaHref: text(document.ctaHref, '/product'),
    highlighted: flag(document.highlighted),
    order: number(document.order, Number.MAX_SAFE_INTEGER),
  };
}

export function toFaq(document: AcharDocument): Faq | null {
  if (!ofType(document, 'faq')) return null;
  const question = text(document.question);
  if (question.length === 0) return null;
  return {
    id: document._id,
    question,
    answer: text(document.answer),
    order: number(document.order, Number.MAX_SAFE_INTEGER),
  };
}

export function toIntegration(document: AcharDocument): Integration | null {
  if (!ofType(document, 'integration')) return null;
  const name = text(document.name);
  if (name.length === 0) return null;
  return {
    id: document._id,
    name,
    description: text(document.description),
    category: optionalText(document.category),
    order: number(document.order, Number.MAX_SAFE_INTEGER),
  };
}

export function toAuthor(document: AcharDocument): Author | null {
  if (!ofType(document, 'author')) return null;
  const name = text(document.name);
  if (name.length === 0) return null;
  return {
    id: document._id,
    name,
    role: optionalText(document.role),
    bio: optionalText(document.bio),
    avatar: imageUrl(document.avatar),
    links: links(document.links),
  };
}

function links(value: unknown): Cta[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const field = record(item);
      const label = text(field.label);
      const href = text(field.href);
      return label.length > 0 && href.length > 0 ? { label, href } : null;
    })
    .filter((link): link is Cta => link !== null);
}

export function toCategory(document: AcharDocument): Category | null {
  if (!ofType(document, 'category')) return null;
  const title = text(document.title);
  if (title.length === 0) return null;
  return {
    id: document._id,
    title,
    slug: slug(document.slug, document._id),
    description: optionalText(document.description),
  };
}

export function toPost(document: AcharDocument): PostRecord | null {
  if (!ofType(document, 'post')) return null;
  const title = text(document.title);
  if (title.length === 0) return null;
  return {
    id: document._id,
    title,
    slug: slug(document.slug, document._id),
    excerpt: optionalText(document.excerpt),
    coverImage: imageUrl(document.coverImage),
    publishedAt: optionalText(document.publishedAt),
    authorId: referenceId(document.author),
    categoryIds: references(document.categories),
    body: portableText(document.body),
    featured: flag(document.featured),
  };
}

/** A record and the lists its references point into, which is all a post needs. */
export function resolvePost(
  record: PostRecord,
  authors: Map<string, Author>,
  categories: Map<string, Category>,
): Post {
  const { authorId, categoryIds, ...post } = record;
  return {
    ...post,
    author: authorId ? authors.get(authorId) : undefined,
    categories: categoryIds
      .map((id) => categories.get(id))
      .filter((category): category is Category => category !== undefined),
  };
}

export function toPage(document: AcharDocument): CmsPage | null {
  if (!ofType(document, 'page')) return null;
  const title = text(document.title);
  if (title.length === 0) return null;
  return {
    id: document._id,
    title,
    slug: slug(document.slug, document._id),
    body: portableText(document.body),
  };
}

/**
 * Rich text, kept only where it is rich text.
 *
 * A `body` that is a string is not a `PortableText` — it is a mistake somewhere
 * upstream — and rendering an empty article is a better answer than rendering a
 * string as if it were an array of blocks.
 */
export function portableText(value: unknown): PortableText {
  if (!Array.isArray(value)) return [];
  return value.filter(isPortableTextNode);
}

function isPortableTextNode(value: unknown): value is PortableText[number] {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  if (node._type === 'image') return true;
  if (node._type !== 'block') return false;
  return Array.isArray(node.children);
}
