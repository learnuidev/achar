import type { DatasetSchema, SchemaType } from '@achar/types';

import { defineField, defineType } from './dsl';
import { hashRevision } from './hash';

/**
 * Achar's own content model — the schema this repository's site is rendered from.
 *
 * It is a real schema rather than a fixture, and it is deliberately the one shape
 * that has to survive all three of its readings: `apps/web` renders documents
 * authored against it, the studio edits them, and `apps/demo` queries them with
 * GROQ. A field added here is a field every one of those has to have an answer
 * for, which is the argument for the model being as small as it is.
 *
 * The types are ordered the way the studio should list them — the singleton
 * first, then the two that are referenced by everything else, then the rest.
 */
export function defaultSchema(): DatasetSchema {
  const types = contentModel().map(defineType);

  return {
    // Achar's own project and dataset names: the seed writes here, and a site
    // reading the fallback content reads from here, so the two agree on where
    // "Achar's content" lives without either of them being told.
    projectId: 'achar',
    dataset: 'production',
    types,
    revision: hashRevision(types),
    updatedAt: new Date().toISOString(),
  };
}

function contentModel(): SchemaType[] {
  return [
    defineType({
      name: 'siteSettings',
      title: 'Site settings',
      kind: 'document',
      icon: 'Settings',
      description: 'The one document the front page is built around.',
      groups: [
        { name: 'general', title: 'General' },
        { name: 'calls', title: 'Calls to action' },
      ],
      fields: [
        defineField({
          name: 'title',
          title: 'Site title',
          type: 'string',
          required: true,
          group: 'general',
          initialValue: 'Achar',
        }),
        defineField({
          name: 'tagline',
          title: 'Tagline',
          type: 'string',
          group: 'general',
          placeholder: 'The content operating system',
        }),
        defineField({
          name: 'description',
          title: 'Description',
          type: 'text',
          rows: 3,
          group: 'general',
          description: 'What the site says about itself, for search results and social cards.',
        }),
        defineField({
          name: 'announcement',
          title: 'Announcement',
          type: 'string',
          group: 'general',
          description: 'A single line above the fold. Empty means there is nothing to announce.',
        }),
        defineField({
          name: 'primaryCta',
          title: 'Primary call to action',
          type: 'object',
          group: 'calls',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string', required: true }),
            defineField({ name: 'href', title: 'Href', type: 'string', required: true }),
          ],
        }),
        defineField({
          name: 'secondaryCta',
          title: 'Secondary call to action',
          type: 'object',
          group: 'calls',
          fields: [
            defineField({ name: 'label', title: 'Label', type: 'string', required: true }),
            defineField({ name: 'href', title: 'Href', type: 'string', required: true }),
          ],
        }),
      ],
      preview: { title: 'title', subtitle: 'tagline' },
    }),

    defineType({
      name: 'author',
      title: 'Author',
      kind: 'document',
      icon: 'Users',
      description: 'Somebody whose name is on a post.',
      fields: [
        defineField({ name: 'name', title: 'Name', type: 'string', required: true }),
        defineField({
          name: 'role',
          title: 'Role',
          type: 'string',
          placeholder: 'Head of content operations',
        }),
        defineField({ name: 'avatar', title: 'Avatar', type: 'image' }),
        defineField({ name: 'bio', title: 'Bio', type: 'text', rows: 4 }),
        defineField({
          name: 'links',
          title: 'Links',
          type: 'array',
          of: [
            defineField({
              name: 'link',
              title: 'Link',
              type: 'object',
              fields: [
                defineField({ name: 'label', title: 'Label', type: 'string', required: true }),
                defineField({ name: 'href', title: 'Href', type: 'url', required: true }),
              ],
            }),
          ],
        }),
      ],
      preview: { title: 'name', subtitle: 'role', media: 'avatar' },
      orderings: [
        { name: 'nameAsc', title: 'Name A–Z', by: [{ field: 'name', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'category',
      title: 'Category',
      kind: 'document',
      icon: 'Layers',
      description: 'A topic posts are filed under.',
      fields: [
        defineField({ name: 'title', title: 'Title', type: 'string', required: true }),
        defineField({
          name: 'slug',
          title: 'Slug',
          type: 'slug',
          required: true,
          description: 'The URL segment — /blog/category/<slug>.',
        }),
        defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
      ],
      preview: { title: 'title', subtitle: 'description' },
      orderings: [
        { name: 'titleAsc', title: 'Title A–Z', by: [{ field: 'title', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'post',
      title: 'Post',
      kind: 'document',
      icon: 'FileText',
      description: 'A blog post, in portable text.',
      groups: [
        { name: 'content', title: 'Content' },
        { name: 'meta', title: 'Metadata' },
      ],
      fields: [
        defineField({ name: 'title', title: 'Title', type: 'string', required: true, group: 'content' }),
        defineField({
          name: 'slug',
          title: 'Slug',
          type: 'slug',
          required: true,
          group: 'meta',
          description: 'The URL segment — /blog/<slug>.',
        }),
        defineField({
          name: 'excerpt',
          title: 'Excerpt',
          type: 'text',
          rows: 3,
          required: true,
          group: 'content',
          description: 'Two sentences, used in lists and cards as written.',
        }),
        defineField({
          name: 'coverImage',
          title: 'Cover image',
          type: 'image',
          group: 'content',
        }),
        defineField({
          name: 'body',
          title: 'Body',
          type: 'portableText',
          rows: 24,
          required: true,
          group: 'content',
        }),
        defineField({
          name: 'publishedAt',
          title: 'Published at',
          type: 'datetime',
          required: true,
          group: 'meta',
        }),
        defineField({
          name: 'author',
          title: 'Author',
          type: 'reference',
          to: ['author'],
          required: true,
          group: 'meta',
        }),
        defineField({
          name: 'categories',
          title: 'Categories',
          type: 'array',
          group: 'meta',
          of: [
            defineField({
              name: 'category',
              title: 'Category',
              type: 'reference',
              to: ['category'],
            }),
          ],
        }),
        defineField({
          name: 'featured',
          title: 'Featured',
          type: 'boolean',
          group: 'meta',
          initialValue: false,
          description: 'Pinned to the top of the blog index.',
        }),
      ],
      preview: { title: 'title', subtitle: 'excerpt', media: 'coverImage' },
      orderings: [
        {
          name: 'publishedAtDesc',
          title: 'Newest first',
          by: [{ field: 'publishedAt', direction: 'desc' }],
        },
        { name: 'titleAsc', title: 'Title A–Z', by: [{ field: 'title', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'page',
      title: 'Page',
      kind: 'document',
      icon: 'Newspaper',
      description: 'A standing page — /docs, /about — authored like a post.',
      fields: [
        defineField({ name: 'title', title: 'Title', type: 'string', required: true }),
        defineField({ name: 'slug', title: 'Slug', type: 'slug', required: true }),
        defineField({ name: 'body', title: 'Body', type: 'portableText', rows: 24 }),
      ],
      preview: { title: 'title', subtitle: 'slug' },
    }),

    defineType({
      name: 'customer',
      title: 'Customer',
      kind: 'document',
      icon: 'Building2',
      description: 'One story on the customer wall.',
      fields: [
        defineField({ name: 'name', title: 'Name', type: 'string', required: true }),
        defineField({ name: 'logo', title: 'Logo', type: 'image' }),
        defineField({ name: 'industry', title: 'Industry', type: 'string' }),
        defineField({ name: 'quote', title: 'Quote', type: 'text', rows: 3 }),
        defineField({
          name: 'quoteAuthor',
          title: 'Quote author',
          type: 'string',
          placeholder: 'Name, role',
        }),
        defineField({
          name: 'metrics',
          title: 'Metrics',
          type: 'array',
          of: [
            defineField({
              name: 'metric',
              title: 'Metric',
              type: 'object',
              fields: [
                defineField({ name: 'label', title: 'Label', type: 'string', required: true }),
                defineField({ name: 'value', title: 'Value', type: 'string', required: true }),
              ],
            }),
          ],
        }),
        defineField({
          name: 'order',
          title: 'Order',
          type: 'number',
          initialValue: 0,
          description: 'Where it sits on the wall.',
        }),
      ],
      preview: { title: 'name', subtitle: 'industry', media: 'logo' },
      orderings: [
        { name: 'orderAsc', title: 'Wall order', by: [{ field: 'order', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'feature',
      title: 'Feature',
      kind: 'document',
      icon: 'Sparkles',
      description: 'One card in the product grid.',
      fields: [
        defineField({ name: 'title', title: 'Title', type: 'string', required: true }),
        defineField({ name: 'description', title: 'Description', type: 'text', rows: 3, required: true }),
        defineField({
          name: 'icon',
          title: 'Icon',
          type: 'string',
          placeholder: 'Database',
          description: 'A lucide-react icon name, drawn beside the title.',
        }),
        defineField({
          name: 'group',
          title: 'Group',
          type: 'string',
          required: true,
          initialValue: 'content',
          options: [
            { title: 'Content', value: 'content' },
            { title: 'Platform', value: 'platform' },
            { title: 'AI', value: 'ai' },
          ],
        }),
        defineField({ name: 'order', title: 'Order', type: 'number', initialValue: 0 }),
      ],
      preview: { title: 'title', subtitle: 'description' },
      orderings: [
        { name: 'orderAsc', title: 'Grid order', by: [{ field: 'order', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'pricingPlan',
      title: 'Pricing plan',
      kind: 'document',
      icon: 'Tag',
      description: 'One column of the pricing table.',
      fields: [
        defineField({ name: 'name', title: 'Name', type: 'string', required: true }),
        defineField({
          name: 'price',
          title: 'Price',
          type: 'string',
          required: true,
          placeholder: '$29',
          description: 'Written as it should read — `$29`, `Free`, `Custom`.',
        }),
        defineField({
          name: 'period',
          title: 'Period',
          type: 'string',
          placeholder: 'per editor / month',
        }),
        defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
        defineField({
          name: 'features',
          title: 'Features',
          type: 'array',
          of: [defineField({ name: 'feature', title: 'Feature', type: 'string' })],
        }),
        defineField({ name: 'ctaLabel', title: 'Call to action', type: 'string', required: true }),
        defineField({ name: 'ctaHref', title: 'Call to action href', type: 'string', required: true }),
        defineField({
          name: 'highlighted',
          title: 'Highlighted',
          type: 'boolean',
          initialValue: false,
          description: 'Drawn as the recommended plan. One plan should be.',
        }),
        defineField({ name: 'order', title: 'Order', type: 'number', initialValue: 0 }),
      ],
      preview: { title: 'name', subtitle: 'price' },
      orderings: [
        { name: 'orderAsc', title: 'Table order', by: [{ field: 'order', direction: 'asc' }] },
      ],
    }),

    defineType({
      name: 'faq',
      title: 'FAQ',
      kind: 'document',
      icon: 'CircleHelp',
      fields: [
        defineField({ name: 'question', title: 'Question', type: 'string', required: true }),
        defineField({ name: 'answer', title: 'Answer', type: 'text', rows: 4, required: true }),
        defineField({ name: 'order', title: 'Order', type: 'number', initialValue: 0 }),
      ],
      preview: { title: 'question', subtitle: 'answer' },
      orderings: [{ name: 'orderAsc', title: 'Asked order', by: [{ field: 'order', direction: 'asc' }] }],
    }),

    defineType({
      name: 'integration',
      title: 'Integration',
      kind: 'document',
      icon: 'Plug',
      fields: [
        defineField({ name: 'name', title: 'Name', type: 'string', required: true }),
        defineField({ name: 'description', title: 'Description', type: 'text', rows: 3 }),
        defineField({
          name: 'category',
          title: 'Category',
          type: 'string',
          placeholder: 'Deployment',
          description: 'What kind of thing it is, which is how the grid groups them.',
        }),
        defineField({ name: 'logo', title: 'Logo', type: 'image' }),
        defineField({ name: 'order', title: 'Order', type: 'number', initialValue: 0 }),
      ],
      preview: { title: 'name', subtitle: 'category', media: 'logo' },
      orderings: [
        { name: 'orderAsc', title: 'Grid order', by: [{ field: 'order', direction: 'asc' }] },
      ],
    }),
  ];
}
