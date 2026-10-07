import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The customer wall, in the order it is drawn.
 *
 * `order` rather than "newest first" because a wall is an argument, and the
 * argument has a best third row: the story that answers the objection in the
 * reader's head goes there, whether or not it is the most recent one signed.
 */
export const seedCustomers: AcharDocument[] = [
  seedDocument('customer-northwind-media', 'customer', {
    name: 'Northwind Media',
    industry: 'Media and publishing',
    quote:
      'We moved eleven mastheads into one lake and stopped maintaining eleven integrations. The part I did not expect is that our editors started reusing things — a chart, a glossary entry, a bio — because for the first time they could find them.',
    quoteAuthor: 'Dana Whitmore, VP Content Operations',
    metrics: [
      { label: 'Faster publishing', value: '4x' },
      { label: 'Documents migrated', value: '41,000' },
      { label: 'Integrations retired', value: '9' },
    ],
    order: 1,
  }),

  seedDocument('customer-kestrel-health', 'customer', {
    name: 'Kestrel Health',
    industry: 'Healthcare',
    quote:
      'Clinical content is reviewed by people who bill by the hour, so every round trip costs real money. Publishing against a schema means the content arrives at review complete instead of arriving to be corrected.',
    quoteAuthor: 'Dr Amina Haddad, Director of Clinical Content',
    metrics: [
      { label: 'Review cycles removed', value: '2' },
      { label: 'Time to publish', value: '6 days → 1' },
      { label: 'Audit findings', value: '0' },
    ],
    order: 2,
  }),

  seedDocument('customer-lantern-financial', 'customer', {
    name: 'Lantern Financial',
    industry: 'Financial services',
    quote:
      'Every disclosure on our site is a document with a review date and a named owner. Modelling that as content rather than as a page template is what finally made the audit a query instead of a spreadsheet.',
    quoteAuthor: 'Marcus Bell, Head of Digital',
    metrics: [
      { label: 'Disclosures under management', value: '12,400' },
      { label: 'Audit preparation', value: '3 weeks → 2 days' },
      { label: 'Missed review dates', value: '0' },
    ],
    order: 3,
  }),

  seedDocument('customer-fjord-commerce', 'customer', {
    name: 'Fjord Commerce',
    industry: 'Retail and e-commerce',
    quote:
      'We write product storytelling once and it lands on twelve storefronts, in the order each market wants it. Before, that was twelve copies and one person who knew which was the current one.',
    quoteAuthor: 'Ingrid Solberg, Content Director',
    metrics: [
      { label: 'Storefronts served', value: '12' },
      { label: 'Time to launch a market', value: '9 days' },
      { label: 'Duplicate copy removed', value: '78%' },
    ],
    order: 4,
  }),

  seedDocument('customer-atlas-robotics', 'customer', {
    name: 'Atlas Robotics',
    industry: 'Manufacturing',
    quote:
      'Field engineers read our documentation on a tablet with one hand while holding a torque wrench in the other. Structured content is what let us serve the same procedure as a web page, a PDF and a checklist in the app.',
    quoteAuthor: 'Priyanka Desai, Documentation Lead',
    metrics: [
      { label: 'Procedures in one source', value: '2,300' },
      { label: 'Support tickets on docs', value: '-38%' },
      { label: 'Surfaces served', value: '4' },
    ],
    order: 5,
  }),

  seedDocument('customer-meridian-travel', 'customer', {
    name: 'Meridian Travel',
    industry: 'Travel and hospitality',
    quote:
      'Twelve locales used to mean twelve editorial calendars and one very tired coordinator. Now the translation is a field on the document, and the calendar is one calendar.',
    quoteAuthor: 'Sofia Marchetti, Localisation Manager',
    metrics: [
      { label: 'Locales shipped', value: '12' },
      { label: 'Editor hours saved weekly', value: '26' },
      { label: 'Time to add a locale', value: '1 week' },
    ],
    order: 6,
  }),
];
