import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@achar/ui';

/**
 * What the product is, in the three views of one document.
 *
 * This is the section a visitor who has never used a headless CMS needs, and the
 * argument is made by showing the same thing three times rather than by
 * describing it: the schema that defines the type, the JSON the API actually
 * stores, and the query a frontend runs to get it. A schema, a document and a
 * query are the whole vocabulary — everything else on this site is a consequence
 * of them.
 */
export function CoreIdea() {
  return (
    <section id="core" className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">The core idea</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Content is data. Everything else follows from that.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            A page builder stores the page. Achar stores the <em>thing the page is about</em> — as a
            document with a type, shaped by a schema your team owns. Write it once in the studio, then
            query it from a website, an app, a print pipeline or an agent, each asking for exactly the
            fields it needs.
          </p>
        </div>

        <Tabs defaultValue="schema" className="mt-12">
          <TabsList>
            <TabsTrigger value="schema">Schema</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
          </TabsList>

          <TabsContent value="schema" className="mt-6">
            <Pane
              title="The type definition"
              note="A schema is a TypeScript-shaped declaration, not a form builder. It is versioned with the project, it is what the studio draws its editors from, and it is what a document is validated against on the way in."
            >
              {`import { defineType, defineField } from '@achar/schema'

export const post = defineType({
  name: 'post',
  title: 'Post',
  kind: 'document',
  fields: [
    defineField({ name: 'title', title: 'Title', type: 'string', required: true }),
    defineField({ name: 'slug', title: 'Slug', type: 'slug', required: true }),
    defineField({ name: 'body', title: 'Body', type: 'portableText' }),
    defineField({ name: 'author', title: 'Author', type: 'reference', to: ['author'] }),
    defineField({ name: 'categories', title: 'Categories', type: 'array', of: [
      defineField({ name: 'category', type: 'reference', to: ['category'] }),
    ] }),
  ],
})`}
            </Pane>
          </TabsContent>

          <TabsContent value="document" className="mt-6">
            <Pane
              title="The document it validates"
              note="One post, as the API returns it. Every field is here because the schema says it may be, and the two system fields that matter are the ones a page never sees: the draft lives at `drafts.<id>`, and publishing is what moves it onto the published id."
            >
              {`{
  "_id": "introducing-the-content-lake",
  "_type": "post",
  "_rev": "8f2a91c4",
  "_createdAt": "2026-02-28T11:04:12.418Z",
  "_updatedAt": "2026-03-04T08:57:41.006Z",
  "title": "Introducing the content lake",
  "slug": { "current": "introducing-the-content-lake" },
  "excerpt": "Content as typed documents, queried at the edge.",
  "publishedAt": "2026-03-04T09:00:00.000Z",
  "author": { "_ref": "priya-raman" },
  "categories": [{ "_ref": "engineering" }],
  "featured": true,
  "body": [
    { "_type": "block", "style": "h2", "children": [
      { "_type": "span", "text": "What a content lake is", "marks": [] }
    ] },
    { "_type": "block", "style": "normal", "children": [
      { "_type": "span", "text": "Content is stored as documents…", "marks": ["strong"] }
    ] }
  ]
}`}
            </Pane>
          </TabsContent>

          <TabsContent value="query" className="mt-6">
            <Pane
              title="The query that reads it"
              note="GROQ is the query language, and it is a projection language before it is a filter: a frontend asks for the fields it will render and nothing else, dereferences the references it needs in the same round trip, and gets back JSON it can put straight on the page."
            >
              {`*[_type == "post" && featured] | order(publishedAt desc) {
  title,
  "slug": slug.current,
  excerpt,
  publishedAt,
  "author": author->{ name, role },
  "categories": categories[]->title,
  "readingTime": round(length(pt::text(body)) / 900)
}

// → 1 document read in 12 ms
// [{
//   title: "Introducing the content lake",
//   author: { name: "Priya Raman", role: "Engineer" },
//   categories: ["Engineering"],
//   readingTime: 4
// }]`}
            </Pane>
          </TabsContent>
        </Tabs>

        <p className="mt-8 text-sm text-muted-foreground">
          The rest of the platform is the consequence:{' '}
          <Link href="/product#lake" className="text-primary underline-offset-4 hover:underline">
            a lake that holds it
          </Link>
          ,{' '}
          <Link href="/product#studio" className="text-primary underline-offset-4 hover:underline">
            a studio that authors it
          </Link>
          , and{' '}
          <Link href="/product#cdn" className="text-primary underline-offset-4 hover:underline">
            a CDN that delivers it
          </Link>
          .
        </p>
      </div>
    </section>
  );
}

function Pane({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: string;
}) {
  return (
    <div className="grid gap-6 rounded-2xl border border-border bg-card p-6 lg:grid-cols-3 lg:items-start">
      <div className="flex flex-col gap-3">
        <h3 className="text-lg font-medium">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{note}</p>
        <Link
          href="/product"
          className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          How it works
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="lg:col-span-2">
        <pre className="achar-fade-edges max-h-96 overflow-auto rounded-xl border border-border bg-background p-4 font-mono text-xs leading-relaxed">
          <code>{children}</code>
        </pre>
      </div>
    </div>
  );
}
