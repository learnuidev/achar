import { CheckIcon, FileTextIcon, GlobeIcon, RadioIcon, ShieldCheckIcon, UsersIcon } from 'lucide-react';
import { cn } from '@achar/ui';

/**
 * The parts of the platform a paragraph is not enough for.
 *
 * The feature grid says what exists; these say what it is like to use, one at a
 * time, with a drawing beside each. The homepage takes the three that answer a
 * first-time reader's question; the product page takes all five, in the order
 * somebody evaluating this would need them — what it stores, how you read it, and
 * what sits at either end of that pipe.
 *
 * They alternate sides because four identical blocks in a row read as a list, and
 * a list of things this different is a list nobody finishes.
 */
export function SplitFeatures({ include }: { include?: readonly string[] }) {
  const sections = include ? SECTIONS.filter((section) => include.includes(section.id)) : SECTIONS;

  return (
    <section className="border-b border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-4 py-20 sm:px-6 sm:py-24">
        {sections.map((section, index) => (
          <Split key={section.id} {...section} flip={index % 2 === 1} />
        ))}
      </div>
    </section>
  );
}

const SECTIONS = [
  {
    id: 'lake',
    eyebrow: 'The content lake',
    title: 'Every document, in one addressable place',
    body: 'A project owns datasets, a dataset owns documents, and nothing is authored outside one. That is what makes "where does this sentence live" a question with one answer — and it is why a document can be referenced by id from a website, an app, a partner feed and a print pipeline without any of them holding a copy.',
    points: [
      'A draft is its own row, so editing never touches what is being served.',
      'Assets live beside the documents that point at them, addressed by reference.',
      'One export is the whole dataset: schema, documents, and the assets they use.',
    ],
    visual: 'lake',
  },
  {
    id: 'groq',
    eyebrow: 'GROQ',
    title: 'One query paints the page',
    body: 'There is no join, because there is no second table. A GROQ query says which documents and then what comes back — filtering, ordering, slicing and dereferencing in one round trip, with a projection that returns exactly the fields the surface will render.',
    points: [
      'References are followed with `->`, so an author arrives as a name rather than an id.',
      'Parameters (`$slug`) keep one query serving every page instead of one query per page.',
      'The same query runs in the studio, so what an editor previews is what the site fetches.',
    ],
    visual: 'groq',
  },
  {
    id: 'studio',
    eyebrow: 'The studio',
    title: 'A studio that draws itself from your schema',
    body: 'There is no page builder here and no field to drag. The schema declares what a post is, and the studio renders the editor for it — the right control for a slug, a reference picker that searches the documents it points at, a rich-text field that produces Portable Text rather than HTML. Change the schema and the studio changes with it, for everyone, immediately.',
    points: [
      'Drafts and published rows are separate documents, so a week of editing never touches what is live.',
      'Publishing is a step somebody takes, with an intent, not a side effect of typing.',
      'Required fields are required at the write, so a document cannot be saved half-shaped.',
    ],
    visual: 'studio',
  },
  {
    id: 'realtime',
    eyebrow: 'Real-time collaboration',
    title: 'Several editors, one document, no locking',
    body: "Presence and document updates arrive over one connection, so two people can work in the same post and see each other's typing settle as it is committed. Nobody checks a document out, nobody overwrites anybody, and the history of who changed which field is a thing you can read rather than a thing you reconstruct.",
    points: [
      'Field-level conflict resolution, with revisions to compare against.',
      'Presence that says who is in the document and where they are in it.',
      'A review step for the person who is allowed to publish.',
    ],
    visual: 'realtime',
  },
  {
    id: 'cdn',
    eyebrow: 'Delivery',
    title: 'Reads served from the edge, in one round trip',
    body: 'Every query is answered from a cache in front of the API, keyed by the query and the perspective it was asked at. A published page is bytes from the nearest edge; a preview is the draft, uncached, for exactly the person who is allowed to see it. Invalidate by tag when a document is published, and the pages that read it — and only those — are rebuilt.',
    points: [
      'Under 50 ms at p95 for a cached query, from anywhere on the network.',
      'Tag-based invalidation driven by the publish webhook, not a full rebuild.',
      'Assets on their own distribution, transformed on request rather than at upload.',
    ],
    visual: 'cdn',
  },
] as const;

function Split({
  id,
  eyebrow,
  title,
  body,
  points,
  visual,
  flip = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  points: readonly string[];
  visual: string;
  flip?: boolean;
}) {
  return (
    <div id={id} className="grid scroll-mt-24 items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn('flex flex-col gap-5', flip && 'lg:order-2')}>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">{eyebrow}</p>
        <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h3>
        <p className="leading-relaxed text-muted-foreground">{body}</p>

        <ul className="flex flex-col gap-3 text-sm">
          {points.map((point) => (
            <li key={point} className="flex gap-3">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className={cn(flip && 'lg:order-1')} aria-hidden>
        <Visual name={visual} />
      </div>
    </div>
  );
}

function Visual({ name }: { name: string }) {
  switch (name) {
    case 'lake':
      return <LakeVisual />;
    case 'groq':
      return <GroqVisual />;
    case 'studio':
      return <StudioVisual />;
    case 'realtime':
      return <RealtimeVisual />;
    default:
      return <CdnVisual />;
  }
}

/** The lake: documents of every type, and which of them are live. */
function LakeVisual() {
  const documents = [
    { id: 'post-content-model', type: 'post', title: 'Your content model is the product decision', state: 'published' },
    { id: 'drafts.post-launch-notes', type: 'post', title: 'Launch notes: content at the edge', state: 'draft' },
    { id: 'author-maya-chen', type: 'author', title: 'Maya Chen', state: 'published' },
    { id: 'category-engineering', type: 'category', title: 'Engineering', state: 'published' },
    { id: 'customer-northwind-media', type: 'customer', title: 'Northwind Media', state: 'published' },
    { id: 'drafts.page-pricing', type: 'page', title: 'Pricing', state: 'draft' },
  ] as const;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
        <FileTextIcon className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">dataset · production</span>
        <span className="ml-auto font-mono text-muted-foreground">41,002 documents</span>
      </div>

      <ul className="divide-y divide-border">
        {documents.map((document) => (
          <li key={document.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <span className="rounded-md bg-accent px-1.5 py-0.5 font-mono text-xs text-accent-foreground">
              {document.type}
            </span>
            <span className="truncate">{document.title}</span>
            <span
              className={cn(
                'ml-auto shrink-0 rounded-full px-2 py-0.5 text-xs',
                document.state === 'draft' ? 'bg-warning/15 text-warning' : 'bg-success/15 text-success',
              )}
            >
              {document.state}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border bg-muted/40 px-4 py-2.5 font-mono text-xs text-muted-foreground">
        <span>_id</span>
        <span>_type</span>
        <span>_rev</span>
        <span className="ml-auto">drafts.&lt;id&gt; is the draft row</span>
      </div>
    </div>
  );
}

/** GROQ: the query, what it read, and what came back. */
function GroqVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
        <span className="text-muted-foreground">Query explorer</span>
        <span className="ml-auto font-mono text-muted-foreground">production</span>
      </div>

      <div className="flex flex-col gap-3 p-4">
        <pre className="overflow-x-auto rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed">
          <code>{`*[_type == "post" && featured]
  | order(publishedAt desc)[0...3] {
    title,
    "slug": slug.current,
    "author": author->{ name, role },
    "categories": categories[]->title
  }`}</code>
        </pre>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <span>2 documents read</span>
          <span>4 fields projected</span>
          <span className="ml-auto text-success">14 ms</span>
        </div>

        <pre className="overflow-x-auto rounded-xl border border-border bg-background p-3 font-mono text-xs leading-relaxed">
          <code>{`[{
  "title": "Your content model is the product decision",
  "slug": "content-model-is-the-product",
  "author": { "name": "Maya Chen", "role": "Head of content operations" },
  "categories": ["Content operations", "Engineering"]
}]`}</code>
        </pre>
      </div>
    </div>
  );
}

/** The studio: a document with a reference picker open and a validation message. */
function StudioVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
      <div className="flex items-center justify-between border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
        <span className="font-mono text-muted-foreground">production / post / launch-notes</span>
        <span className="rounded-full bg-warning/15 px-2 py-0.5 text-warning">Unpublished changes</span>
      </div>

      <div className="flex flex-col gap-4 p-5 text-sm">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Title</span>
          <span className="rounded-lg border border-border bg-background px-3 py-2">
            Launch notes: content at the edge
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Slug</span>
            <span className="truncate rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              launch-notes
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Published at</span>
            <span className="rounded-lg border border-border bg-background px-3 py-2 font-mono text-xs">
              2026-04-02
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Author</span>
          <span className="flex items-center gap-2 rounded-lg border border-primary/50 bg-background px-3 py-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-accent text-xs">PR</span>
            Priya Raman
            <span className="ml-auto text-xs text-muted-foreground">reference → author</span>
          </span>
          <span className="mt-1 flex flex-col gap-1 rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
            <span>Priya Raman — Design systems lead</span>
            <span>Jonah Whitfield — Developer advocate</span>
          </span>
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-4">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" />
            <span className="text-xs text-muted-foreground">Schema valid</span>
          </span>
          <span className="ml-auto flex gap-2">
            <span className="rounded-lg border border-border px-3 py-1.5 text-xs">Discard draft</span>
            <span className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground">Publish</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Collaboration: who is here, and what they are touching. */
function RealtimeVisual() {
  const editors = [
    { initials: 'MC', name: 'Maya', doing: 'rewriting the intro' },
    { initials: 'PR', name: 'Priya', doing: 'editing “Portable Text”' },
    { initials: 'JW', name: 'Jonah', doing: 'reviewing' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
        <UsersIcon className="size-4 text-muted-foreground" />
        <span className="text-muted-foreground">3 people in this document</span>
        <span className="ml-auto flex items-center gap-1.5 text-success">
          <RadioIcon className="size-3.5" />
          live
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <ul className="flex flex-col gap-2 text-sm">
          {editors.map((editor) => (
            <li key={editor.initials} className="flex items-center gap-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-accent-foreground">
                {editor.initials}
              </span>
              <span className="font-medium">{editor.name}</span>
              <span className="text-muted-foreground">{editor.doing}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4 text-sm">
          <p className="text-muted-foreground">
            Content is stored as typed documents rather than as pages
            <span className="ml-0.5 inline-block h-4 w-px align-middle bg-primary" />
          </p>
          <p className="text-muted-foreground">
            <span className="rounded-sm bg-primary/15 px-0.5 text-foreground">
              …so a design change is a query change
            </span>
            , not a migration.
          </p>
          <div className="flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-primary" />
              Maya is typing
            </span>
            <span className="ml-auto font-mono">rev 8f2a91c4</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Delivery: the edge, with numbers a reader can check against their own. */
function CdnVisual() {
  const regions = [
    { region: 'iad · Washington', latency: '11 ms', hit: '99.4%' },
    { region: 'fra · Frankfurt', latency: '17 ms', hit: '98.9%' },
    { region: 'sin · Singapore', latency: '23 ms', hit: '99.1%' },
    { region: 'syd · Sydney', latency: '29 ms', hit: '97.6%' },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/5">
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-xs">
        <GlobeIcon className="size-4 text-muted-foreground" />
        <span className="truncate font-mono text-muted-foreground">GET /v1/data/query/acme/production</span>
        <span className="ml-auto flex items-center gap-1.5 text-success">
          <ShieldCheckIcon className="size-3.5" />
          cached
        </span>
      </div>

      <div className="p-5">
        <ul className="flex flex-col divide-y divide-border text-sm">
          {regions.map((entry) => (
            <li key={entry.region} className="flex items-center gap-3 py-2.5">
              <span className="font-mono text-xs text-muted-foreground">{entry.region}</span>
              <span className="ml-auto tabular-nums">{entry.latency}</span>
              <span className="w-16 text-right tabular-nums text-muted-foreground">{entry.hit}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-background px-4 py-3 font-mono text-xs text-muted-foreground">
          <span>x-achar-cache: HIT</span>
          <span>age: 42s</span>
          <span>revalidate: tag:post</span>
        </div>
      </div>
    </div>
  );
}
