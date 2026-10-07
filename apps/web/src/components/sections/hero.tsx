import Link from 'next/link';
import { ArrowRightIcon, CheckIcon, CircleIcon, FileCodeIcon, HistoryIcon, UsersIcon } from 'lucide-react';
import { Badge, Button } from '@achar/ui';
import type { SiteSettings } from '@/content/types';

/**
 * The front page's first screen: the claim, the two ways in, and a picture of the
 * product.
 *
 * The picture is drawn rather than screenshotted — the same decision the rest of
 * this site makes about its illustrations. A screenshot is a promise about a
 * release; this panel is a claim about the *shape* of the thing, and it stays
 * true: types on the left, a document authored against one in the middle, the
 * query that reads it on the right. It is `aria-hidden`, because everything it
 * says is said in the copy beside it and a screen reader reading a fake query
 * result is worse than silence.
 */
export function Hero({ settings }: { settings: SiteSettings }) {
  return (
    <section className="relative isolate overflow-hidden border-b border-border/60">
      <div aria-hidden className="achar-grid absolute inset-0 -z-10 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-96 bg-primary/10 blur-3xl"
      />

      <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
        <div className="max-w-3xl">
          {settings.announcement ? (
            <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
              <CircleIcon className="size-2 fill-primary text-primary" aria-hidden />
              {settings.announcement}
            </p>
          ) : null}

          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            {settings.tagline}
          </h1>

          <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
            {settings.description}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={settings.primaryCta.href}>
                {settings.primaryCta.label}
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href={settings.secondaryCta.href}>{settings.secondaryCta.label}</Link>
            </Button>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            No credit card. A dataset, a schema and a studio in about five minutes.
          </p>
        </div>

        <HeroPanel />
      </div>
    </section>
  );
}

/**
 * The product, as three panes of real DOM.
 *
 * Every string in it is one a real project contains, because the panel is doing
 * the explaining: the same `post` document appears as a form on the left, as the
 * JSON the API stores in the middle, and as the GROQ query that returns it on the
 * right. Somebody who has never used a headless CMS should be able to read this
 * panel and come away knowing what one is.
 */
function HeroPanel() {
  return (
    <div
      aria-hidden
      className="mt-14 overflow-hidden rounded-2xl border border-border bg-card shadow-2xl shadow-black/5 sm:mt-16"
    >
      <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
        <span className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </span>
        <span className="font-mono text-xs text-muted-foreground">acme-content / production</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="hidden items-center gap-1.5 sm:flex">
            <UsersIcon className="size-3.5" />
            3 editing
          </span>
          <span className="flex items-center gap-1.5 text-success">
            <CheckIcon className="size-3.5" />
            Saved
          </span>
        </span>
      </div>

      <div className="grid divide-y divide-border lg:grid-cols-3 lg:divide-x lg:divide-y-0">
        <SchemaPane />
        <DocumentPane />
        <QueryPane />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <HistoryIcon className="size-3.5" />
          Draft autosaved 12 seconds ago
        </span>
        <span className="flex items-center gap-1.5">
          <FileCodeIcon className="size-3.5" />
          12 documents · 4 types · revision 8f2a91
        </span>
      </div>
    </div>
  );
}

/** The left pane: the schema, which is what the other two panes are about. */
function SchemaPane() {
  const types = [
    { name: 'post', count: 4, active: true },
    { name: 'author', count: 2, active: false },
    { name: 'category', count: 3, active: false },
    { name: 'siteSettings', count: 1, active: false },
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Content lake</p>

      <ul className="flex flex-col gap-1 text-sm">
        {types.map((type) => (
          <li
            key={type.name}
            className={`flex items-center gap-2 rounded-lg px-2 py-1.5 font-mono text-xs ${
              type.active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
            }`}
          >
            <span className="truncate">{type.name}</span>
            <span className="ml-auto tabular-nums opacity-60">{type.count}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-4 font-mono text-xs text-muted-foreground">
        <span className="flex justify-between gap-2">
          <span>published</span>
          <span className="text-success">12</span>
        </span>
        <span className="flex justify-between gap-2">
          <span>drafts</span>
          <span className="text-warning">2</span>
        </span>
      </div>
    </div>
  );
}

/** The middle pane: a document, authored against the schema on the left. */
function DocumentPane() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-muted-foreground">post · drafts.introducing-achar</p>
        <Badge variant="secondary" className="ml-auto">
          Draft
        </Badge>
      </div>

      <Field label="Title" value="Introducing the content lake" />
      <Field label="Slug" value="introducing-the-content-lake" mono />
      <Field label="Published at" value="2026-03-04T09:00:00Z" mono />

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Body</span>
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs">
          <span className="font-medium">What a content lake is</span>
          <span className="text-muted-foreground">
            Content is stored as typed documents, not as rows and columns…
          </span>
        </div>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-2">
        <Button size="sm" className="pointer-events-none">
          Publish
        </Button>
        <Button size="sm" variant="outline" className="pointer-events-none">
          Preview
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={`truncate rounded-lg border border-border bg-background px-3 py-2 text-xs ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** The right pane: GROQ, and what it answered. */
function QueryPane() {
  const query = [
    '*[_type == "post" && featured]',
    '  | order(publishedAt desc) {',
    '    title,',
    '    "author": author->name,',
    '    "categories": categories[]->title',
    '  }',
  ];

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Query</p>

      <pre className="overflow-hidden rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed">
        <code>{query.join('\n')}</code>
      </pre>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>3 documents read</span>
        <span className="text-success">18 ms</span>
      </div>

      <div className="rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed">
        <span className="text-muted-foreground">{'['}</span>
        <br />
        <span>{'  { title: "Introducing the content lake",'}</span>
        <br />
        <span>{'    author: "Priya Raman" }'}</span>
        <br />
        <span className="text-muted-foreground">{']'}</span>
      </div>
    </div>
  );
}
