import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The eight questions the site answers, in the order they are asked.
 *
 * The order is the point: they run from "is this the right shape of thing"
 * through the two objections that stop a trial, and end on the one that only
 * matters once somebody has decided.
 */
export const seedFaqs: AcharDocument[] = [
  seedDocument('faq-what-is-achar', 'faq', {
    question: 'What is Achar, in one paragraph?',
    answer:
      'Achar is a content lake with a query language and a studio. You model your content as documents with a schema, author them in the studio, and read them from any surface with one HTTP API. The schema is shared by all three, so the studio draws its form from the same definition your queries run against.',
    order: 1,
  }),

  seedDocument('faq-how-is-it-different', 'faq', {
    question: 'How is this different from a page-based CMS?',
    answer:
      'A page-based CMS stores the page. Achar stores the story and lets each surface decide what a story looks like, which is what makes the second frontend — an app, a partner feed, a support site — a query rather than a second copy of your content.',
    order: 2,
  }),

  seedDocument('faq-do-i-need-to-know-groq', 'faq', {
    question: 'Do I have to learn a query language to use it?',
    answer:
      'You have to read one. Most reads are a filter and a projection, which is a line you can copy from the studio and adjust: the studio runs your query against the dataset as you write it, so the first draft of any query is a thing you can see working before it reaches your code.',
    order: 3,
  }),

  seedDocument('faq-migrate-existing-content', 'faq', {
    question: 'Can I bring existing content across?',
    answer:
      'Yes, and the honest answer is that the modelling is the work rather than the transfer. A dataset exports and imports as portable JSON with its schema, and the migration is usually a script that maps fields, run first against a staging dataset and checked with a query before it is run again against production.',
    order: 4,
  }),

  seedDocument('faq-where-is-content-hosted', 'faq', {
    question: 'Where does my content live?',
    answer:
      'In your own AWS account on the paid plans: DynamoDB for documents, S3 and CloudFront for media, Cognito for sign-in. You can deploy the backend with the CDK app in this repository, which means the content outlives any decision you make about us.',
    order: 5,
  }),

  seedDocument('faq-what-happens-free-tier', 'faq', {
    question: 'What happens when I outgrow the free plan?',
    answer:
      'Nothing stops working and nothing is deleted. The plan limits are checked when a document is written, so the editor is the first thing to tell you, and upgrading keeps every id, revision and reference exactly as they are.',
    order: 6,
  }),

  seedDocument('faq-does-ai-write-content', 'faq', {
    question: 'Does the AI feature write my content?',
    answer:
      'It drafts into the draft row and stops there. Suggestions are attached to a field with a schema behind it — an excerpt, a translation, a category — and a person accepts or rejects each one. Nothing reaches a published document without somebody pressing publish.',
    order: 7,
  }),

  seedDocument('faq-how-do-i-try-it', 'faq', {
    question: 'How do I try it without a sales call?',
    answer:
      'Create a project, seed a dataset with the sample content in this repository, and query it. The whole path — schema, documents, query, published page — is about ten minutes, and there is a demo app that does nothing but call the API so you can see what a third-party client looks like.',
    order: 8,
  }),
];
