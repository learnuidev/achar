import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon, KeyRoundIcon, TerminalIcon } from 'lucide-react';
import { Button } from '@achar/ui';

import { CodeBlock } from '@/components/docs/code-block';
import { CredentialPanel } from '@/components/docs/credential-panel';
import { DocsRail } from '@/components/docs/docs-rail';
import { EndpointCard } from '@/components/docs/endpoint-card';
import { renderEmphasis } from '@/components/docs/emphasis';
import { PlaygroundProvider } from '@/components/docs/playground-context';
import { authConfigFromEnv } from '@achar/auth';
import { curlFor } from '@/lib/api-example';
import {
  API_ENDPOINT_GROUPS,
  API_ENDPOINTS,
  API_CONVENTIONS,
  API_ERRORS,
  API_ERROR_EXAMPLE,
} from '@/lib/api-reference';
import { apiUrlFromEnv } from '@/lib/env';

/**
 * The API reference.
 *
 * One page rather than a page per endpoint, on purpose: this API is forty routes,
 * and a reader who can scroll from "what a token is" to "the exact JSON that comes
 * back" learns the whole surface in one sitting. When it stops fitting it splits —
 * the data behind it (`lib/api-reference`) is one object per endpoint and does not
 * care how many pages render it.
 *
 * The layout is the reference's own: a rail of anchors and a column of cards,
 * rather than the site's marketing sections. A reference is not a place you navigate
 * around; you arrive from a token you have just made, read the section you came for,
 * and go back to your terminal. It wears the site's header and footer because it is
 * a page anyone can open — no account, no studio — which is also why it can hold an
 * API token and cannot hold a session.
 *
 * **The base URL printed everywhere is the one this deployment actually serves**
 * (`apiUrlFromEnv`), so every `curl` on the page is a command that runs against the
 * API this site reads its own content from. That is the whole reason the examples
 * are built rather than written.
 */
export const metadata: Metadata = {
  title: 'API reference — read Achar from your own code',
  description:
    'The content API: query a dataset with GROQ, read and write documents, upload assets, and manage projects — with an API token or a signed-in person’s token. Forty routes, documented, with a playground.',
};

export default function ApiDocsPage() {
  const baseUrl = apiUrlFromEnv();

  // The quickstart's third step is a real request, built from the same reference
  // the cards below are built from: the first call anybody makes with a new token.
  const info = API_ENDPOINTS.find((endpoint) => endpoint.id === 'info');
  const query = API_ENDPOINTS.find((endpoint) => endpoint.id === 'query');
  const firstCall = info ? curlFor(info, baseUrl) : '';

  return (
    <PlaygroundProvider>
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex gap-10">
          <DocsRail />

          <main className="min-w-0 flex-1">
            <header id="overview" className="scroll-mt-24">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                API reference
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-balance">
                Read Achar from your own code
              </h1>
              <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                A content lake with a query language, a document API with drafts and publishing, and
                an asset pipeline where the bytes never pass through a server. Everything here is
                served from{' '}
                <span className="font-mono text-xs text-foreground">
                  {baseUrl || 'your own deployment'}
                </span>{' '}
                — the same API this site renders its own pages from.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Button asChild size="sm">
                  <Link href="/studio">
                    Make a token
                    <ArrowRightIcon />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="#query">See the query language</Link>
                </Button>
                <span className="text-xs text-muted-foreground">
                  {API_ENDPOINTS.length} routes · {API_ENDPOINT_GROUPS.length} groups
                </span>
              </div>
            </header>

            <section id="try-it" className="mt-10 scroll-mt-24 space-y-3">
              <h2 className="text-lg font-medium">Try it here</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                **Signed in, make one here**: pick a project you administer, name the token and choose
                what it may do — the secret is shown once and goes straight into the requests below.
                Signed out, paste a token you already have. Either way the request goes from your
                browser to the API with the credential in the header and nothing in between.
              </p>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Only the routes that accept a **token** can be called this way — the management routes
                are verified at the gateway and need a signed-in person&rsquo;s ID token, which this
                page will not hold.
              </p>
              {/* The same reading of the environment the site's layout makes: a pool
                  is what makes a session readable, and the panel is told rather than
                  asking, because asking would throw when there is none. */}
              <CredentialPanel apiUrl={baseUrl} withSession={authConfigFromEnv() !== null} />
            </section>

            <section id="quickstart" className="mt-10 scroll-mt-24 space-y-3">
              <h2 className="text-lg font-medium">Quickstart</h2>
              <ol className="grid gap-4">
                <li className="grid gap-2">
                  <p className="text-sm">
                    <span className="font-medium">1. Make a project, and a dataset in it.</span> A
                    project owns datasets and people; a dataset is the content store everything below
                    is addressed by. Both are made in the studio, and a new dataset starts with{' '}
                    <span className="font-medium">no content types</span> — you write them, as
                    TypeScript or from a sample of your own data.
                  </p>
                </li>
                <li className="grid gap-2">
                  <p className="text-sm">
                    <span className="font-medium">2. Issue a token.</span> On the project&rsquo;s{' '}
                    <span className="font-mono text-xs">API</span> screen, as an admin. It carries a
                    role — <span className="font-mono text-xs">VIEWER</span>,{' '}
                    <span className="font-mono text-xs">EDITOR</span> or{' '}
                    <span className="font-mono text-xs">ADMIN</span> — and optionally one dataset, and
                    the secret is shown exactly once.
                  </p>
                </li>
                <li className="grid gap-2">
                  <p className="text-sm">
                    <span className="font-medium">3. Ask it something.</span> The first call anybody
                    makes is the one that needs no credential at all:
                  </p>
                  <CodeBlock code={firstCall} label="cURL" />
                </li>
                <li className="grid gap-2">
                  <p className="text-sm">
                    <span className="font-medium">4. Then query your own content.</span> GROQ is the
                    whole point: one language over the dataset, evaluated server-side, with parameters
                    rather than string interpolation.
                  </p>
                  {query && (
                    <CodeBlock
                      code={curlFor(query, baseUrl, {
                        path: { projectId: 'proj_647baf1fe6b1', dataset: 'production' },
                        query: { query: '*[_type == "post"] | order(publishedAt desc)[0...5]' },
                      })}
                      label="cURL"
                    />
                  )}
                </li>
              </ol>
            </section>

            <section id="authentication" className="mt-10 scroll-mt-24 space-y-3">
              <h2 className="text-lg font-medium">Authentication</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Achar accepts two kinds of caller, and which one you hold decides which routes answer
                you. Both go in the same header —{' '}
                <span className="font-mono text-xs">Authorization: Bearer …</span> — and they are
                verified in two different places, which is the part that surprises people.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <KeyRoundIcon className="size-4 text-primary" />
                    <p className="text-sm font-medium">An API token</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    <span className="font-mono">achar_&lt;tokenId&gt;_&lt;secret&gt;</span>. Scoped
                    to one project, with a role, and revocable on its own — so it keeps working when
                    the person who issued it leaves. Verified **by the handler**, because API
                    Gateway&rsquo;s authorizer only understands Cognito.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    It reaches the content and asset routes:{' '}
                    <span className="font-mono">/v1/data/**</span> and{' '}
                    <span className="font-mono">/v1/assets/**</span>.
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <TerminalIcon className="size-4 text-muted-foreground" />
                    <p className="text-sm font-medium">A person&rsquo;s ID token</p>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    A Cognito ID token from signing in. The studio and the console send this, and it
                    is verified **at the gateway** — before any handler runs — which is why an API
                    token presented to a management route is refused with a 401 rather than reaching
                    code that could explain itself.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    It reaches everything: projects, datasets, schemas, members, tokens, webhooks.
                  </p>
                </div>
              </div>

              <p className="max-w-2xl text-xs text-muted-foreground">
                There is no OAuth here, and that is a decision rather than an omission: a token is
                issued by an admin to a script, and the alternative — asking a third party&rsquo;s
                users to consent to scopes — belongs to a product that has users to ask. A token is
                also a **kind** of credential as well as a rank: it can never create or delete a
                project, whatever role it carries.
              </p>
            </section>

            <section id="query-language" className="mt-10 scroll-mt-24 space-y-3">
              <h2 className="text-lg font-medium">The query language</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Achar speaks a subset of GROQ, and it says which subset rather than failing quietly:
                anything outside it is a <span className="font-mono text-xs">400</span> naming the
                position in the query.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <CodeBlock
                  label="Filters, projections, ordering"
                  code={`*[_type == "post" && featured] {
  title,
  "author": author->name,
  categories[]->title
} | order(publishedAt desc)[0...10]`}
                />
                <CodeBlock
                  label="Parameters, counts, slices"
                  code={`{
  "total": count(*[_type == "post"]),
  "draft": *[_id == $id][0],
  "tagged": *[_type == "post" && $tag in tags]
}`}
                />
              </div>
              <p className="max-w-2xl text-xs text-muted-foreground">
                Understood: <span className="font-mono">*</span>, filters with{' '}
                <span className="font-mono">&amp;&amp;</span>,{' '}
                <span className="font-mono">||</span>, <span className="font-mono">!</span>,
                comparisons, <span className="font-mono">in</span>,{' '}
                <span className="font-mono">match</span>,{' '}
                <span className="font-mono">defined()</span>,{' '}
                <span className="font-mono">count()</span>,{' '}
                <span className="font-mono">order()</span>, slices, projections,{' '}
                <span className="font-mono">-&gt;</span> dereference,{' '}
                <span className="font-mono">^</span> parent,{' '}
                <span className="font-mono">$param</span> and the pipe operator.
              </p>
            </section>

            {API_ENDPOINT_GROUPS.map((group) => (
              <section key={group.id} id={group.id} className="mt-12 scroll-mt-24 space-y-4">
                <div className="space-y-1">
                  <h2 className="text-lg font-medium">{group.title}</h2>
                  <p className="max-w-2xl text-sm text-muted-foreground">
                    {renderEmphasis(group.description)}
                  </p>
                </div>

                <div className="grid gap-5">
                  {group.endpoints.map((endpoint) => (
                    <EndpointCard key={endpoint.id} endpoint={endpoint} baseUrl={baseUrl} />
                  ))}
                </div>
              </section>
            ))}

            <section id="errors" className="mt-12 scroll-mt-24 space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-medium">Errors</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  One envelope, whoever refused the request — a handler, the gateway, or the
                  validator. <span className="font-mono text-xs">code</span> is what a program
                  branches on; <span className="font-mono text-xs">message</span> is written for a
                  person and is safe to show.
                </p>
              </div>

              <CodeBlock code={API_ERROR_EXAMPLE} label="400 Bad Request" />

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-border">
                    {API_ERRORS.map((error) => (
                      <tr key={error.code} className="align-top">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                          {error.status}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-foreground">{error.code}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {renderEmphasis(error.meaning)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section id="conventions" className="mt-12 scroll-mt-24 space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-medium">Conventions</h2>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  The things that are true of every route, said once instead of forty times.
                </p>
              </div>

              <ul className="grid gap-2">
                {API_CONVENTIONS.map((convention) => (
                  <li
                    key={convention}
                    className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span
                      aria-hidden
                      className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground"
                    />
                    <span>{renderEmphasis(convention)}</span>
                  </li>
                ))}
              </ul>

              <p className="text-xs text-muted-foreground">
                The reasoning behind all of this — why two kinds of credential, why publishing is an
                operation, why history lives in its own table — is in the repository, in{' '}
                <span className="font-mono">docs/architecture.md</span>.
              </p>
            </section>
          </main>
        </div>
      </div>
    </PlaygroundProvider>
  );
}
