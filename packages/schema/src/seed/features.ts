import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The twelve cards on the product page, three groups of four.
 *
 * The `icon` names a real lucide-react icon, because the site resolves it against
 * that library: a name that does not exist renders as nothing at all, which is
 * exactly the kind of gap nobody notices until a launch.
 */
export const seedFeatures: AcharDocument[] = [
  seedDocument('feature-content-lake', 'feature', {
    title: 'One content lake',
    description:
      'Every document, asset and schema in one dataset, addressable by id and queryable from any surface. Nothing is authored outside a dataset, so there is never a second place to look.',
    icon: 'Database',
    group: 'content',
    order: 1,
  }),

  seedDocument('feature-structured-documents', 'feature', {
    title: 'Structured documents',
    description:
      'A document is an array of fields with a type, not a row with columns. Add a field to the schema and every surface can read it without a migration.',
    icon: 'FileText',
    group: 'content',
    order: 2,
  }),

  seedDocument('feature-portable-text', 'feature', {
    title: 'Portable Text',
    description:
      'Rich text as an array of blocks and spans — renderable on the web, in an app, in an email, and countable in a query when something has to be audited.',
    icon: 'Layers',
    group: 'content',
    order: 3,
  }),

  seedDocument('feature-asset-pipeline', 'feature', {
    title: 'Asset pipeline',
    description:
      'Uploads go straight to storage with a presigned URL, never through the API. Images are served from a CDN with transform parameters decided at read time.',
    icon: 'Boxes',
    group: 'content',
    order: 4,
  }),

  seedDocument('feature-groq-queries', 'feature', {
    title: 'GROQ queries',
    description:
      'Filter, order, slice, dereference and project in one query string. One read paints a page, and the query is the same one your editor can run in the studio.',
    icon: 'Search',
    group: 'platform',
    order: 5,
  }),

  seedDocument('feature-drafts-and-revisions', 'feature', {
    title: 'Drafts and revisions',
    description:
      'A draft is its own row, so it can be edited for a week while the site keeps serving what was published. Publishing is one reversible write with a revision on each side.',
    icon: 'GitBranch',
    group: 'platform',
    order: 6,
  }),

  seedDocument('feature-roles-and-tokens', 'feature', {
    title: 'Roles and API tokens',
    description:
      'Admins, editors and viewers per project, plus scoped tokens for machines — one dataset each, revocable one at a time, and never shown twice.',
    icon: 'ShieldCheck',
    group: 'platform',
    order: 7,
  }),

  seedDocument('feature-global-delivery', 'feature', {
    title: 'Global delivery',
    description:
      'Content and media are served from an edge CDN, with cache purges fired from the publish event rather than from a deploy pipeline somebody has to remember to run.',
    icon: 'Globe',
    group: 'platform',
    order: 8,
  }),

  seedDocument('feature-webhooks', 'feature', {
    title: 'Webhooks and pipelines',
    description:
      'Tell the search index, the static build and the partner feed what changed, with a GROQ filter and a projection so each listener gets only what it asked for.',
    icon: 'Workflow',
    group: 'platform',
    order: 9,
  }),

  seedDocument('feature-schema-aware-ai', 'feature', {
    title: 'Schema-aware drafting',
    description:
      'Your schema is the prompt: drafting, tagging and summarising all run against fields that already have a shape, a description and a closed set of options.',
    icon: 'Sparkles',
    group: 'ai',
    order: 10,
  }),

  seedDocument('feature-semantic-search', 'feature', {
    title: 'Semantic search',
    description:
      'Find the document that says a thing, not the document that contains a word — including the ones written before you joined, which is where the useful ones always are.',
    icon: 'Zap',
    group: 'ai',
    order: 11,
  }),

  seedDocument('feature-translation-drafts', 'feature', {
    title: 'Translation drafts',
    description:
      'Locales are fields on the document, and a model can fill them into a draft. A person still reads it before it is published, and the record says who did.',
    icon: 'Languages',
    group: 'ai',
    order: 12,
  }),
];
