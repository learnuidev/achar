import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The eight integrations on the wall.
 *
 * `category` is a free string rather than a reference to a type of its own: there
 * are eight of these and they will never be a content type anybody authors
 * separately, so a reference would be a second document to maintain for the sake
 * of grouping four rows.
 */
export const seedIntegrations: AcharDocument[] = [
  seedDocument('integration-nextjs', 'integration', {
    name: 'Next.js',
    description:
      'Read a dataset from a server component with the typed client, and let ISR revalidate on the publish webhook instead of on a timer.',
    category: 'Frameworks',
    order: 1,
  }),

  seedDocument('integration-vercel', 'integration', {
    name: 'Vercel',
    description:
      'Deploy previews that read the staging dataset, and a production build that is purged by the same event that publishes the content.',
    category: 'Deployment',
    order: 2,
  }),

  seedDocument('integration-github-actions', 'integration', {
    name: 'GitHub Actions',
    description:
      'Run the seed script against a scratch dataset on every pull request, so a schema change is reviewed with the content it affects.',
    category: 'Automation',
    order: 3,
  }),

  seedDocument('integration-slack', 'integration', {
    name: 'Slack',
    description:
      'A channel told when a document is published, with the projection shaped to the three fields a reader of the message needs.',
    category: 'Collaboration',
    order: 4,
  }),

  seedDocument('integration-figma', 'integration', {
    name: 'Figma',
    description:
      'Keep the copy in a design file and the copy in the lake the same, by anchoring a frame to a document and diffing on export.',
    category: 'Design',
    order: 5,
  }),

  seedDocument('integration-shopify', 'integration', {
    name: 'Shopify',
    description:
      'Product storytelling lives in the lake and the catalogue lives in Shopify; a page reads both and neither has to be copied into the other.',
    category: 'Commerce',
    order: 6,
  }),

  seedDocument('integration-algolia', 'integration', {
    name: 'Algolia',
    description:
      'A webhook projection feeds the index with exactly the fields the search results draw, so an unpublished draft never becomes searchable.',
    category: 'Search',
    order: 7,
  }),

  seedDocument('integration-snowflake', 'integration', {
    name: 'Snowflake',
    description:
      'Nightly exports of a dataset into the warehouse, so content can be joined against traffic and revenue by people who will never open the studio.',
    category: 'Analytics',
    order: 8,
  }),
];
