import type { AcharDocument } from '@achar/types';

import { ref, seedDocument } from './document';
import { bodyFor } from './portable-text';

/**
 * The ten posts the blog is rendered from.
 *
 * Written as real copy rather than placeholder text, because this seed is both
 * what `apps/app` falls back to when no API is configured and what the seed
 * script pushes into a real dataset: a page of lorem ipsum hides every layout
 * problem that only appears with a long headline, a list or a code block.
 *
 * Each body is a builder scoped to the post's id — see `portable-text.ts` — so
 * the block keys are unique within the document and stable across runs.
 */
const contentModelBody = bodyFor('post-content-model-is-the-product');
const groqBody = bodyFor('post-groq-in-twenty-minutes');
const lakeBody = bodyFor('post-a-content-lake-is-not-a-cms');
const draftBody = bodyFor('post-draft-publish-two-row-trick');
const editorSchemaBody = bodyFor('post-schema-editors-can-use');
const portableTextBody = bodyFor('post-portable-text-as-data');
const referencesBody = bodyFor('post-modelling-references');
const workflowBody = bodyFor('post-editorial-workflow');
const webhookBody = bodyFor('post-webhooks-and-cache-purges');
const aiBody = bodyFor('post-ai-in-the-editorial-loop');

export const seedPosts: AcharDocument[] = [
  seedDocument(
    'post-content-model-is-the-product',
    'post',
    {
      title: 'Your content model is the product decision',
      slug: 'content-model-is-the-product',
      excerpt:
        'Every content system fails the same way: a field that grew a second meaning, and a template that reads it both ways. The model is the one thing you will still be living with in three years.',
      publishedAt: '2025-11-14T09:00:00.000Z',
      author: ref('author-maya-chen'),
      categories: [ref('category-content-operations'), ref('category-engineering')],
      featured: true,
      body: [
        contentModelBody.p(
          'Nobody sets out to build a content model with a field called `extra`. It arrives in the third month, when one page needs one more thing and the schema is already live — and by the second year there are four fields whose names nobody will defend and a template that reads all of them.',
        ),
        contentModelBody.h2('The model outlives everything around it'),
        contentModelBody.p(
          'Every other layer of a content system gets replaced on a schedule. The frontend is rewritten when the framework moves, the design changes with the brand, the delivery layer changes when the CDN does. The documents stay. That is the argument for spending the week you were going to spend on the hero animation on the schema instead: it is the part of the work the next three frontends will be built on.',
        ),
        contentModelBody.p(
          'The test of a model is not whether it is elegant. It is whether a new editor can file a document correctly without asking anybody. If they have to ask whether the excerpt is the same as the description, the model contains a question that should have been a decision.',
        ),
        contentModelBody.quote(
          'A field that two people describe differently is not a field. It is a conversation that happens again every time somebody saves.',
        ),
        contentModelBody.h2('Three questions that settle most arguments'),
        ...contentModelBody.list([
          'Is this a document or a field of one? If a page can link to it, it is a document.',
          'Who fills it in first? Whoever does decides whether it is required, and whether it needs a description.',
          'What happens when it is empty? If the answer is that the template breaks, it is required — and the schema should say so rather than the template.',
        ]),
        contentModelBody.p(
          'Answer those three in writing and the argument about naming gets much shorter, because most naming arguments are really arguments about where a thing lives.',
        ),
        contentModelBody.p(
          'Then write the query that finds the documents that predate your decision. It is one line, and it is the difference between a model you changed and a model you only meant to change.',
        ),
        contentModelBody.code('count(*[_type == "post" && !defined(excerpt)])'),
      ],
    },
    '2025-11-14T09:00:00.000Z',
  ),

  seedDocument(
    'post-groq-in-twenty-minutes',
    'post',
    {
      title: 'GROQ in twenty minutes',
      slug: 'groq-in-twenty-minutes',
      excerpt:
        'There is no join, because there is no second table. A query says which documents and then what to return, and everything that looks like syntax is one of those two halves made more specific.',
      publishedAt: '2025-11-11T09:00:00.000Z',
      author: ref('author-tomas-ferreira'),
      categories: [ref('category-engineering')],
      featured: false,
      body: [
        groqBody.p(
          'GROQ is a query language for documents, and the fastest way to learn it is to stop thinking in tables. There is no join, because there is no second table: there is a set of documents, and a way to walk from one to another.',
        ),
        groqBody.h2('A filter, and then a projection'),
        groqBody.p(
          'A query has two halves. The first says which documents: `*[_type == "post"]`. The second says what comes back: `{ title, slug }`. Everything else — ordering, slicing, dereferencing — is one of those halves made more specific. Reading a query out loud as "the posts, newest ten, with the author\'s name" is not a mnemonic; it is the grammar.',
        ),
        groqBody.p(
          'The half people skip is the projection. `*[_type == "post"]` returns whole documents, which is fine against a dataset of forty and expensive against forty thousand. A projection is not an optimisation you add later; it is the second half of the sentence you were already writing.',
        ),
        groqBody.quote(
          'A query that returns fields nobody reads pays for them twice — once over the wire, and once in the render.',
        ),
        groqBody.h2('Dereferencing is the whole trick'),
        ...groqBody.list([
          '`author->name` follows a reference and answers one field of it.',
          '`categories[]->title` does it for every item of a list.',
          '`^` is the parent, which is how a nested projection reaches back outwards.',
          '`$slug` is a parameter, so one query serves every page instead of one per page.',
        ]),
        groqBody.p(
          'Once references and projections are both familiar, most of what you would have written a bespoke endpoint to do becomes a query string inside a component — which is also the version of it that caches.',
        ),
        groqBody.code(
          '*[_type == "post" && slug == $slug][0]{ title, excerpt, "author": author->name, "categories": categories[]->title }',
        ),
        groqBody.p(
          'Read that one back in English: the post whose slug is this, the first one, with its title and excerpt, its author\'s name, and the titles of its categories. Every operator in it is one of the ten this implementation supports.',
        ),
      ],
    },
    '2025-11-11T09:00:00.000Z',
  ),

  seedDocument(
    'post-a-content-lake-is-not-a-cms',
    'post',
    {
      title: 'A content lake is not a CMS',
      slug: 'a-content-lake-is-not-a-cms',
      excerpt:
        'A CMS owns your pages. A lake owns your content and has no opinion about your pages, which sounds like a small distinction until the second frontend arrives.',
      publishedAt: '2025-11-07T09:00:00.000Z',
      author: ref('author-maya-chen'),
      categories: [ref('category-content-operations')],
      featured: false,
      body: [
        lakeBody.p(
          'A CMS owns your pages. A content lake owns your content and has no opinion about your pages, which sounds like a small distinction until the second frontend arrives — a mobile app, a partner feed, a support site — and the page template turns out to have been the thing in the way.',
        ),
        lakeBody.h2('Pages are a view, not a format'),
        lakeBody.p(
          'The old arrangement stores a page: a headline, three columns, and the order they appear in. The new one stores a story, and lets each surface decide what a story looks like. The same document becomes a landing-page headline, a push notification and a line in a weekly digest, and none of those needed a second copy of the text.',
        ),
        lakeBody.p(
          'The cost is real. Somebody has to model, and modelling is a skill that building page templates did not require. The return is that the fourth surface is a query rather than a migration.',
        ),
        lakeBody.quote('The second frontend is where a page-shaped CMS stops being cheap.'),
        lakeBody.h2('What a lake has to get right'),
        ...lakeBody.list([
          'One document, one id, one history — everywhere it appears.',
          'References rather than copies, so a rename happens once.',
          'A query language, so a new surface does not need a new endpoint and a deploy.',
          'Assets addressed by content URL rather than by path, so reorganising the library breaks nothing.',
        ]),
        lakeBody.p(
          'Get those four right and the fifth surface is an afternoon. Get them wrong and you have built a CMS with a database you cannot leave — which is the expensive version of the same product.',
        ),
        lakeBody.code(
          '*[_type in ["post", "page"] && defined(slug)] | order(_updatedAt desc) { _type, title, "author": author->name }',
        ),
        lakeBody.p(
          'One query, two kinds of page, and a shape that a blog index and a docs sidebar can both read. That is the whole promise, and it is worth checking against your own model before you commit to one.',
        ),
      ],
    },
    '2025-11-07T09:00:00.000Z',
  ),

  seedDocument(
    'post-draft-publish-two-row-trick',
    'post',
    {
      title: 'Draft, publish, and the two-row trick',
      slug: 'draft-publish-two-row-trick',
      excerpt:
        'Achar stores a draft as a second document whose id begins `drafts.` rather than a flag on one row. It looks like duplication, and it is the reason a headline can be rewritten for a week without touching what the site serves.',
      publishedAt: '2025-11-03T09:00:00.000Z',
      author: ref('author-tomas-ferreira'),
      categories: [ref('category-engineering'), ref('category-content-operations')],
      featured: true,
      body: [
        draftBody.p(
          'Most content systems store a draft flag. Achar stores two rows: the document, and the same document whose id begins `drafts.`. It looks like duplication, and it is the reason an editor can rewrite a headline for a week while the site keeps serving the old one.',
        ),
        draftBody.h2('One flag is one write away from a mistake'),
        draftBody.p(
          'With a flag, the draft and the published version are the same row. Every save is an implicit decision about whether the public is looking at this yet, and every integration that reads content has to know the flag exists and honour it. Publishing becomes a boolean flip that either happened or did not, with nothing left to compare against afterwards.',
        ),
        draftBody.p(
          'With two rows, the draft is a document nobody but its editor can see, and publishing is a copy. That makes it atomic, revertible the way any other write is, and invisible to everything that reads published content — including the CDN, which never sees a half-edited page.',
        ),
        draftBody.quote(
          'A draft is not a state of a document. It is a second document that is about to become the first.',
        ),
        draftBody.h2('What falls out of the arrangement'),
        ...draftBody.list([
          'A read sees the published row or the draft, never a mixture of the two.',
          'Discarding a draft is deleting one row, and cannot reach what is live.',
          'Publishing is one transaction with a revision on each side of it.',
          'A preview is the draft read by the same query that serves the site, not a second renderer.',
        ]),
        draftBody.p(
          'The cost is one extra row per edited document and one rule everybody has to learn: an id beginning `drafts.` is not content, it is a proposal. Written on the first screen of the studio, that rule is cheaper than any amount of documentation about a flag.',
        ),
        draftBody.code('*[_id == $draftId][0]{ title, "editedAt": _updatedAt }'),
        draftBody.p(
          'Reading the draft explicitly is what a preview does. Everything else reads the published id and is correct by construction rather than by remembering.',
        ),
      ],
    },
    '2025-11-03T09:00:00.000Z',
  ),

  seedDocument(
    'post-schema-editors-can-use',
    'post',
    {
      title: 'Designing a schema editors can actually use',
      slug: 'schema-editors-can-use',
      excerpt:
        'A schema is a design document that happens to be executable. Every decision in it is a decision about what somebody sees first, what they can skip, and which mistake they will make.',
      publishedAt: '2025-10-29T09:00:00.000Z',
      author: ref('author-priya-raman'),
      categories: [ref('category-design-systems'), ref('category-content-operations')],
      featured: false,
      body: [
        editorSchemaBody.p(
          'A schema is a design document that happens to be executable. The studio draws its form from it, so every decision in it is a decision about what an editor sees first, what they can skip, and which mistake they are going to make on a Thursday afternoon.',
        ),
        editorSchemaBody.h2('The form is the schema, read out loud'),
        editorSchemaBody.p(
          'Titles, descriptions and placeholders are not decoration. A field called `summary` with no description is a field somebody fills in wrongly once and then copies wrongly forever. The twenty minutes it takes to write "two sentences, used in lists as written" is the cheapest documentation a content team ever gets, and it is attached to the thing it describes.',
        ),
        editorSchemaBody.p(
          'Groups matter more than order. Somebody filling in a post is doing two jobs — writing the thing, and filing it — and a form that puts the publish date between the intro and the body interrupts both. Two groups, named for the jobs, remove most of the scrolling.',
        ),
        editorSchemaBody.quote(
          'Every optional field is a question. If you cannot say who answers it, it should not be on the form.',
        ),
        editorSchemaBody.h2('Four rules that hold up'),
        ...editorSchemaBody.list([
          'Put the field the editor writes first at the top, always, even when it is not required.',
          'Group by job rather than by type: content, then metadata.',
          'Use a picker for anything with a closed set of values, and a free string only when the value is genuinely open.',
          'Mark a field required only when an empty one breaks something you can name out loud.',
        ]),
        editorSchemaBody.p(
          'None of that is specific to Achar. It is what editorial designers have known for a century, applied to a form that a machine also has to read — and the second reader is the reason it has to be written down rather than agreed.',
        ),
        editorSchemaBody.p(
          'The list a studio draws is the same schema, projected: a title, the field the type says names it, and the two fields worth sorting by.',
        ),
        editorSchemaBody.code(
          '*[_type == "post"] | order(publishedAt desc)[0...20]{ title, "author": author->name, publishedAt }',
        ),
      ],
    },
    '2025-10-29T09:00:00.000Z',
  ),

  seedDocument(
    'post-portable-text-as-data',
    'post',
    {
      title: 'Portable Text, and why rich text should be data',
      slug: 'portable-text-as-data',
      excerpt:
        'Rich text stored as HTML is a string with structure in it that only a browser can read. Stored as an array of blocks it is data: queryable, transformable, and renderable by something that is not a browser.',
      publishedAt: '2025-10-24T09:00:00.000Z',
      author: ref('author-priya-raman'),
      categories: [ref('category-design-systems'), ref('category-engineering')],
      featured: false,
      body: [
        portableTextBody.p(
          'Rich text stored as HTML is a string with structure inside it that only a browser can read. Stored as an array of blocks, it is data: queryable, transformable, and renderable by something that is not a browser — which is the requirement that shows up the first time content has to reach an app, an email, or a feed.',
        ),
        portableTextBody.h2('Blocks, spans, and marks'),
        portableTextBody.p(
          'A paragraph is a block with a style. The words in it are spans, and a span\'s `marks` array says what is applied to it — `strong`, `em`, `code`, or the key of a link definition held beside the block. Nothing in that structure implies a tag, which is what lets one document become a web page, a native view and a plain-text email without being parsed three times.',
        ),
        portableTextBody.p(
          'The thing teams miss is that marks are per span rather than per range. A sentence with a bold phrase in it is three spans, not one span with offsets — more data, and much less ambiguity, since there is no way to describe a range that has drifted out of step with the text it pointed into.',
        ),
        portableTextBody.quote(
          'If your rich text cannot be counted, filtered or migrated, you have a blob with formatting in it.',
        ),
        portableTextBody.h2('What the shape buys you'),
        ...portableTextBody.list([
          'A renderer per surface, and no parser anywhere.',
          'Queries over structure — count the posts with an image in the body.',
          'Validation of a document rather than of a string, with a path to point at.',
          'Migration by transformation, run once, checked before it is kept.',
        ]),
        portableTextBody.p(
          'The renderer is a switch over `_type` and `style`, which is about thirty lines, and it is the only place in a codebase that knows what a paragraph looks like. That is the whole return on the array.',
        ),
        portableTextBody.code(
          'for (const node of body) { if (node._type === "block" && node.style === "h2") renderHeading(node) }',
        ),
        portableTextBody.p(
          'The same body is what the studio edits, and the editor is a view of the array rather than a source of truth about it — which is why a block pasted in from somewhere else is validated on the way in, not on the way out.',
        ),
      ],
    },
    '2025-10-24T09:00:00.000Z',
  ),

  seedDocument(
    'post-modelling-references',
    'post',
    {
      title: 'Modelling references without modelling yourself into a corner',
      slug: 'modelling-references',
      excerpt:
        'Copying an author\'s name into every post they wrote is the fastest thing to build and the slowest thing to fix. A reference writes it once, and the cost is one extra step on every read.',
      publishedAt: '2025-10-17T09:00:00.000Z',
      author: ref('author-tomas-ferreira'),
      categories: [ref('category-engineering')],
      featured: false,
      body: [
        referencesBody.p(
          'Copying an author\'s name into every post they wrote is the fastest thing to build and the slowest thing to fix. A reference writes that information once and points at it, and the cost is one extra step on every read — a trade that is obviously right at the tenth post and obviously wrong to argue about at the first.',
        ),
        referencesBody.h2('References are pointers, not joins'),
        referencesBody.p(
          'A reference is an id in a wrapper: `{ _ref: "author-maya-chen", _type: "reference" }`. It carries no target type, deliberately. A type inside the reference would mean renaming a type is a migration of every document that mentions it, and what a reference may point at is the schema\'s business anyway. A query\'s `->` is what turns the pointer into the document.',
        ),
        referencesBody.p(
          'The uncomfortable part is deletion. Nothing stops a reference from pointing at a document that is gone, and nothing should: a strict foreign key over content makes one editor\'s save wait on another editor\'s write. Instead the read is written to survive a missing target, and a sweep finds the orphans on a schedule.',
        ),
        referencesBody.quote('A reference that cannot dangle is a reference that blocks somebody else\'s save.'),
        referencesBody.h2('Two habits that keep it healthy'),
        ...referencesBody.list([
          'Project the fields you need across the reference, and nothing else.',
          'Write the renderer so a missing target draws nothing rather than throwing.',
          'Reach outwards with `^` when a nested projection needs a field from outside it.',
          'Sweep for orphans on a schedule rather than on every write.',
        ]),
        referencesBody.p(
          'Done that way, a rename is one document, a deletion is a decision somebody makes on purpose, and the content stays readable while both happen.',
        ),
        referencesBody.code(
          '*[_type == "post"]{ title, "author": author->{ name, role }, "categoryCount": count(categories) }',
        ),
        referencesBody.p(
          'Counting a list of references without dereferencing any of them is worth noticing: `count(categories)` answers from the document in hand, and a page that only needed the number never reads the categories at all.',
        ),
      ],
    },
    '2025-10-17T09:00:00.000Z',
  ),

  seedDocument(
    'post-editorial-workflow',
    'post',
    {
      title: 'An editorial workflow that survives a Tuesday',
      slug: 'editorial-workflow',
      excerpt:
        'Most workflows are described in a document nobody reads and enforced by a person who is on holiday. The one that survives is the one the tool refuses to let you skip.',
      publishedAt: '2025-10-09T09:00:00.000Z',
      author: ref('author-maya-chen'),
      categories: [ref('category-content-operations')],
      featured: false,
      body: [
        workflowBody.p(
          'Most editorial workflows are described in a document nobody reads and enforced by a person who is on holiday. The workflow that survives a Tuesday is the one the tool refuses to let you skip — not because anybody is untrustworthy, but because a rule nobody can forget is a rule that does not need a meeting to reinforce.',
        ),
        workflowBody.h2('States, not intentions'),
        workflowBody.p(
          'A draft is not ready for review because somebody typed "ready for review" in a chat window. It is ready because it validates, because an editor moved it, and because there is a published version to compare it against. Anything else is a status meeting with a database attached, and the database loses the second somebody is busy.',
        ),
        workflowBody.p(
          'The publish step is the one worth being strict about. If publishing is a button an author can press, then it is a button an author will press on a Friday — so schema validation and the review requirement belong at that boundary rather than at the door to the studio, where they only slow down work that was never going to ship badly.',
        ),
        workflowBody.quote(
          'A workflow is a set of things the tool will not do, not a set of things people have agreed to do.',
        ),
        workflowBody.h2('What to enforce, in order'),
        ...workflowBody.list([
          'Required fields at publish — an incomplete draft is fine, an incomplete publish is not.',
          'Validation with reasons attached, so the author can fix it without asking anybody.',
          'A preview drawn by the real renderer, so "looks fine here" means something.',
          'A publish that can be taken back, because the schedule will be wrong once.',
        ]),
        workflowBody.p(
          'Start with the first two. They are mechanical, unglamorous, and they remove most of the coordination a content team is currently paying for with meetings and reminders.',
        ),
        workflowBody.p(
          'The last one is a query away at any time: the posts that have been written and never dated are the ones a workflow is failing to move.',
        ),
        workflowBody.code('count(*[_type == "post" && !defined(publishedAt)])'),
      ],
    },
    '2025-10-09T09:00:00.000Z',
  ),

  seedDocument(
    'post-webhooks-and-cache-purges',
    'post',
    {
      title: 'Webhooks, cache purges, and the five minutes after publish',
      slug: 'webhooks-and-cache-purges',
      excerpt:
        'Publishing is only half a write. The other half is everything that cached the old version, and a webhook is how all of it finds out at once.',
      publishedAt: '2025-10-02T09:00:00.000Z',
      author: ref('author-jonah-whitfield'),
      categories: [ref('category-engineering')],
      featured: false,
      body: [
        webhookBody.p(
          'Publishing is only half a write. The other half is everything that cached the old version — the CDN, the static build, the search index, the partner\'s nightly import — and a webhook is how all of it finds out at once instead of within the hour.',
        ),
        webhookBody.h2('Fire on the event, filter in the payload'),
        webhookBody.p(
          'A webhook that fires on every write is one that rebuilds a site because somebody fixed a typo in a draft. The event says what happened; the filter says whether this listener cares, and `_type == "post"` is most of the difference between a useful webhook and a queue nobody reads.',
        ),
        webhookBody.p(
          'The projection matters for the same reason. Sending the whole document means the receiver has the whole document\'s shape to keep up with; sending the four fields it actually uses means the next field you add is not somebody else\'s deploy.',
        ),
        webhookBody.quote('A webhook is a promise to a system you do not control. Send it less than you could.'),
        webhookBody.h2('What a delivery record should tell you'),
        ...webhookBody.list([
          'Which webhook, which document, which event.',
          'Which attempt this was, and how long it took.',
          'What the receiver answered, status code included.',
          'Whether it succeeded, without reading a log to find out.',
        ]),
        webhookBody.p(
          'Retries with backoff are table stakes. What actually saves an afternoon is being able to answer "did the deploy hear about this post" from the studio rather than from a log console — which is a question about the delivery record, not about the delivery.',
        ),
        webhookBody.code(
          '*[_type == "post" && publishedAt > $since] | order(publishedAt asc) { _id, title, slug }',
        ),
        webhookBody.p(
          'That is also the query a receiver runs to catch up after a missed delivery, which is worth designing for: a webhook that can be replayed by asking for everything since a timestamp is a webhook you can trust on a bad network.',
        ),
      ],
    },
    '2025-10-02T09:00:00.000Z',
  ),

  seedDocument(
    'post-ai-in-the-editorial-loop',
    'post',
    {
      title: 'Where AI actually helps a content team',
      slug: 'ai-in-the-editorial-loop',
      excerpt:
        'The interesting thing is not that a model can write a paragraph. It is that a schema tells the model what a complete document looks like, which is the part every general assistant has to guess at.',
      publishedAt: '2025-09-25T09:00:00.000Z',
      author: ref('author-jonah-whitfield'),
      categories: [ref('category-ai'), ref('category-content-operations')],
      featured: false,
      body: [
        aiBody.p(
          'The interesting thing about AI in a content system is not that a model can write a paragraph. It is that a schema tells the model what a complete document looks like — which is the part every general-purpose assistant has to guess at, and guesses at differently on every attempt.',
        ),
        aiBody.h2('The schema is the best prompt you have'),
        aiBody.p(
          'A model asked to "write a blog post" produces something shaped like an average of the internet. Asked to fill a `post` with a title, a two-sentence excerpt, a body in portable text and a reference to an author who already exists, it produces something an editor can accept, reject or edit — because the shape of the answer was never the model\'s decision to make.',
        ),
        aiBody.p(
          'That is also where the boundary belongs. Generation goes into the draft row and never the published one. A suggestion is attached to a field and never silently applied. Anything that ships has a person\'s name on it, and the record says so.',
        ),
        aiBody.quote(
          'The useful question is not whether a model can write it. It is whether it can write it into your model.',
        ),
        aiBody.h2('Where it earns its place today'),
        ...aiBody.list([
          'Drafting an excerpt from a body that already exists and is already good.',
          'Translating into a locale the schema already has a field for.',
          'Tagging a document against the categories the team actually uses, and no others.',
          'Summarising a diff for the person who has to approve it.',
        ]),
        aiBody.p(
          'All four are the same trick: the model is filling a field whose shape, options and constraints are already written down. Everything outside that is a chat window next to a CMS, which is useful and is a different product.',
        ),
        aiBody.code(
          '*[_type == "post"][0]{ title, excerpt, "bodyBlocks": count(body), "author": author->name, "categories": categories[]->title }',
        ),
        aiBody.p(
          'Reading a document back in the shape it was authored in is how a suggestion is checked, and the same projection is what a diff shows a reviewer. Neither needs a model to be implemented; both are what make one safe to point at content that matters.',
        ),
      ],
    },
    '2025-09-25T09:00:00.000Z',
  ),
];
