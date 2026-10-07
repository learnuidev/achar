import type { AcharDocument } from '@achar/types';

import { seedDocument } from './document';

/**
 * The pricing table, in the order it reads left to right.
 *
 * `price` and `period` are strings because they are prose on the page: `Free`,
 * `$29`, `Custom` and `per editor / month` do not fit one number and one unit,
 * and a plan table that forced them into two columns would show `0` where the
 * page means "no card required".
 */
export const seedPricingPlans: AcharDocument[] = [
  seedDocument('pricing-free', 'pricingPlan', {
    name: 'Free',
    price: 'Free',
    period: 'one editor, forever',
    description: 'For a side project, a prototype, or the first honest test of whether this fits.',
    features: [
      'One editor and two datasets',
      '1,000 documents',
      'GROQ queries and the HTTP API',
      'Asset pipeline with CDN delivery',
      'Community support',
    ],
    ctaLabel: 'Start free',
    ctaHref: '/signup',
    highlighted: false,
    order: 1,
  }),

  seedDocument('pricing-growth', 'pricingPlan', {
    name: 'Growth',
    price: '$29',
    period: 'per editor / month',
    description: 'For a team that publishes every week and wants the workflow enforced by the tool.',
    features: [
      'Unlimited editors and datasets',
      '50,000 documents',
      'Draft previews and revision history',
      'Webhooks with filters and projections',
      'Roles, invitations and API tokens',
      'Email support in one business day',
    ],
    ctaLabel: 'Start free trial',
    ctaHref: '/signup?plan=growth',
    highlighted: true,
    order: 2,
  }),

  seedDocument('pricing-scale', 'pricingPlan', {
    name: 'Scale',
    price: '$99',
    period: 'per editor / month',
    description: 'For several products on one lake, with the audit trail and the uptime to match.',
    features: [
      'Everything in Growth',
      'Unlimited documents',
      'Audit log export',
      'Custom webhook projections and replay',
      '99.95% uptime commitment',
      'Priority support with a two-hour response',
    ],
    ctaLabel: 'Start free trial',
    ctaHref: '/signup?plan=scale',
    highlighted: false,
    order: 3,
  }),

  seedDocument('pricing-enterprise', 'pricingPlan', {
    name: 'Enterprise',
    price: 'Custom',
    period: 'annual contract',
    description: 'For a content estate that has to live in your own account, under your own rules.',
    features: [
      'Everything in Scale',
      'Single-tenant deployment in your AWS account',
      'SSO with SAML and SCIM provisioning',
      'Custom data residency',
      'A named solutions engineer',
      'Migration support and a rehearsal cutover',
    ],
    ctaLabel: 'Talk to us',
    ctaHref: '/contact',
    highlighted: false,
    order: 4,
  }),
];
