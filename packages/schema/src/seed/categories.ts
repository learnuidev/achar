import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/** The five topics the blog is filed under, in the order the filter bar shows them. */
export const seedCategories: AcharDocument[] = [
  seedDocument('category-content-operations', 'category', {
    title: 'Content operations',
    slug: 'content-operations',
    description:
      'The work around the work: naming, roles, review, and the workflow that decides whether a team of twelve can ship on a Thursday.',
  }),

  seedDocument('category-engineering', 'category', {
    title: 'Engineering',
    slug: 'engineering',
    description:
      'Queries, schemas, caching and migrations — the parts of a content system that are somebody\'s code rather than somebody\'s copy.',
  }),

  seedDocument('category-design-systems', 'category', {
    title: 'Design systems',
    slug: 'design-systems',
    description:
      'Editors and components, portable text and typography: how the shape of a document becomes the shape of a page.',
  }),

  seedDocument('category-ai', 'category', {
    title: 'AI',
    slug: 'ai',
    description:
      'What a model can usefully do with content that already has a schema — and the places it should keep its hands off.',
  }),

  seedDocument('category-customer-stories', 'category', {
    title: 'Customer stories',
    slug: 'customer-stories',
    description: 'How teams moved their content into one lake, and what changed after they did.',
  }),
];
