'use client';

import { AcharApiError, AcharClient } from '@achar/api';
import type { AcharDocument } from '@achar/types';
import { useState } from 'react';

/**
 * What this page knows how to ask for.
 *
 * GROQ written out as strings rather than hidden behind the client's helpers,
 * because the query *is* the thing being demonstrated: an outsider's first
 * question about a content API is what its query language looks like, and a
 * dropdown of named queries would hide exactly that.
 */
const QUERIES = [
  {
    name: 'Recent posts',
    query: '*[_type == "post"] | order(publishedAt desc) [0...6] { title, "slug": slug.current, excerpt, publishedAt }',
  },
  {
    name: 'Posts by a category',
    query:
      '*[_type == "post" && references(*[_type == "category" && slug.current == $category]._id)] | order(publishedAt desc) [0...5] { title, "author": author->name }',
    params: { category: 'content-operations' },
  },
  {
    name: 'Count everything',
    query: 'count(*[_type == "post"])',
  },
  {
    name: 'The site’s own settings',
    query: '*[_type == "siteSettings"][0] { title, tagline, "cta": primaryCta.label }',
  },
] as const;

interface Credentials {
  apiUrl: string;
  token: string;
  projectId: string;
  dataset: string;
}

const STORAGE_KEY = 'achar:demo:credentials';

/**
 * What an outside client actually has to be told.
 *
 * Read from the environment first so a deployed demo works without anybody
 * typing anything, and kept in `localStorage` afterwards — the credentials belong
 * to whoever is looking at the page, and a token pasted into a shared server
 * would be a token the server now holds.
 */
function loadCredentials(): Credentials {
  const fromEnv: Credentials = {
    apiUrl: process.env.NEXT_PUBLIC_ACHAR_API_URL ?? '',
    token: process.env.NEXT_PUBLIC_ACHAR_DEMO_TOKEN ?? '',
    projectId: process.env.NEXT_PUBLIC_ACHAR_DEMO_PROJECT ?? '',
    dataset: process.env.NEXT_PUBLIC_ACHAR_DEMO_DATASET ?? 'production',
  };

  if (typeof window === 'undefined') return fromEnv;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return fromEnv;
    // The environment wins for the URL — a demo pointed at the wrong deployment
    // by a stale browser is a bug that looks like a broken API.
    return { ...fromEnv, ...(JSON.parse(stored) as Partial<Credentials>) };
  } catch {
    return fromEnv;
  }
}

export default function DemoPage() {
  const [credentials, setCredentials] = useState<Credentials>(loadCredentials);
  const [queryIndex, setQueryIndex] = useState(0);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  const selected = QUERIES[queryIndex];

  const configured =
    credentials.apiUrl.trim() !== '' &&
    credentials.token.trim() !== '' &&
    credentials.projectId.trim() !== '' &&
    credentials.dataset.trim() !== '';

  function update<K extends keyof Credentials>(key: K, value: Credentials[K]) {
    const next = { ...credentials, [key]: value };
    setCredentials(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // A browser refusing storage is not a reason to refuse to run a query.
    }
  }

  async function run() {
    setRunning(true);
    setError(null);
    setResult(null);

    const client = new AcharClient({ apiUrl: credentials.apiUrl, token: credentials.token });

    try {
      const answer = await client.query(credentials.projectId, credentials.dataset, {
        query: selected.query,
        params: 'params' in selected ? selected.params : undefined,
        perspective: 'published',
      });
      setResult(answer.result);
      setMs(answer.ms);
    } catch (cause) {
      // The API answers every failure with an envelope, and printing *that* is the
      // point: a demo that swallowed the message would teach nothing about what
      // went wrong.
      setError(
        cause instanceof AcharApiError
          ? `${cause.status} ${cause.body.error.code}: ${cause.body.error.message}`
          : cause instanceof Error
            ? cause.message
            : 'The request failed for a reason the browser did not describe.',
      );
    } finally {
      setRunning(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-14">
      <p className="text-xs font-medium tracking-wide text-primary uppercase">Achar demo</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        An outside client of the content API
      </h1>
      <p className="mt-3 text-muted-foreground">
        This page imports <code className="font-mono text-sm">@achar/api</code> and{' '}
        <code className="font-mono text-sm">@achar/types</code> and nothing else. It is what
        somebody who has never opened this repository would build against a deployed environment —
        point it at one, paste an API token from the studio, and read content back.
      </p>

      <section className="mt-10 rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold">Where to point it</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="API URL" value={credentials.apiUrl} onChange={(v) => update('apiUrl', v)} placeholder="https://abc123.execute-api.us-east-1.amazonaws.com" wide />
          <Field label="API token" value={credentials.token} onChange={(v) => update('token', v)} placeholder="achar_…" type="password" wide />
          <Field label="Project id" value={credentials.projectId} onChange={(v) => update('projectId', v)} placeholder="01M3DQK2P9FJQZE83FNDDDG03D" />
          <Field label="Dataset" value={credentials.dataset} onChange={(v) => update('dataset', v)} placeholder="production" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Held in this browser only. An API token is a credential, and a server that stored one for
          you is a server that could use it.
        </p>
      </section>

      <section className="mt-8 rounded-xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-2">
          {QUERIES.map((entry, index) => (
            <button
              key={entry.name}
              type="button"
              onClick={() => setQueryIndex(index)}
              className={
                index === queryIndex
                  ? 'rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }
            >
              {entry.name}
            </button>
          ))}
        </div>

        <pre className="mt-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed">
          {selected.query}
        </pre>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={!configured || running}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run query'}
          </button>
          {ms !== null && !running ? (
            <span className="text-xs text-muted-foreground">answered in {ms} ms</span>
          ) : null}
          {!configured ? (
            <span className="text-xs text-muted-foreground">
              Fill in the four fields above first.
            </span>
          ) : null}
        </div>
      </section>

      {error ? (
        <section className="mt-8 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
          <h2 className="text-sm font-semibold text-destructive">The API refused it</h2>
          <p className="mt-2 font-mono text-xs break-words text-destructive">{error}</p>
        </section>
      ) : null}

      {result !== null ? (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">What came back</h2>
          <div className="mt-3 space-y-3">
            {Array.isArray(result) && result.length > 0 ? (
              (result as AcharDocument[]).map((document, index) => (
                <DocumentCard key={typeof document._id === 'string' ? document._id : index} document={document} />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                {Array.isArray(result)
                  ? 'No documents matched.'
                  : `A single value: ${JSON.stringify(result)}`}
              </p>
            )}
          </div>
          <details className="mt-4">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              The raw JSON the API answered with
            </summary>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </main>
  );
}

/** One document, drawn from the fields the query projected and nothing else. */
function DocumentCard({ document }: { document: AcharDocument }) {
  const title = typeof document.title === 'string' ? document.title : String(document._id);

  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <h3 className="font-medium">{title}</h3>
      {typeof document.excerpt === 'string' ? (
        <p className="mt-1 text-sm text-muted-foreground">{document.excerpt}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        {typeof document.author === 'string' ? <span>by {document.author}</span> : null}
        {typeof document.publishedAt === 'string' ? (
          <span>{new Date(document.publishedAt).toLocaleDateString()}</span>
        ) : null}
        <span className="font-mono text-muted-foreground/70">{document._id}</span>
      </div>
    </article>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
  wide,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  wide?: boolean;
}) {
  return (
    <label className={wide ? 'block sm:col-span-2' : 'block'}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type={type ?? 'text'}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </label>
  );
}
