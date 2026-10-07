import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The four people whose names are on the posts.
 *
 * Ids are slugs of the names rather than generated, so a post's reference is
 * readable in the JSON and a diff of two seeds says which author changed.
 */
export const seedAuthors: AcharDocument[] = [
  seedDocument('author-maya-chen', 'author', {
    name: 'Maya Chen',
    role: 'Head of content operations',
    bio: 'Maya ran content operations for a publisher with eleven mastheads before joining Achar. She spends most of her time on the unglamorous half of content: naming things consistently, retiring things on purpose, and making sure the person who wrote a headline can still find it a year later.',
    links: [
      { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mayachen' },
      { label: 'Mastodon', href: 'https://mastodon.social/@mayachen' },
    ],
  }),

  seedDocument('author-tomas-ferreira', 'author', {
    name: 'Tomás Ferreira',
    role: 'Principal engineer',
    bio: 'Tomás wrote the query engine behind Achar and has strong opinions about what a query language should refuse to do. Previously he built a document store that outlived three rewrites of its frontend, which is where most of those opinions came from.',
    links: [
      { label: 'GitHub', href: 'https://github.com/tomasferreira' },
      { label: 'Notes', href: 'https://tomasf.dev' },
    ],
  }),

  seedDocument('author-priya-raman', 'author', {
    name: 'Priya Raman',
    role: 'Design systems lead',
    bio: 'Priya designs the studio and the interfaces content teams stare at for six hours a day. She came to content tooling from editorial design, which she says is the same job: deciding what a reader sees first, and defending that decision against everybody who wants to add one more thing.',
    links: [{ label: 'Portfolio', href: 'https://priyaraman.design' }],
  }),

  seedDocument('author-jonah-whitfield', 'author', {
    name: 'Jonah Whitfield',
    role: 'Developer advocate',
    bio: 'Jonah writes the integrations, the examples, and the migration guides, and answers the questions that turn into both. He has migrated content between five systems and would like to talk you out of a sixth.',
    links: [
      { label: 'GitHub', href: 'https://github.com/jonahwhitfield' },
      { label: 'Bluesky', href: 'https://bsky.app/profile/jonahwhitfield.dev' },
    ],
  }),
];
