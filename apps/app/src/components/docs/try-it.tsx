'use client';

import { useState } from 'react';
import { Loader2Icon, RotateCcwIcon, SendIcon } from 'lucide-react';
import { Button, Input, Label, cn } from '@achar/ui';

import { CodeBlock } from '@/components/docs/code-block';
import { usePlayground } from '@/components/docs/playground-context';
import { runEndpoint, triesInBrowser, type PlaygroundResult } from '@/lib/api-playground';
import { bodyFor, type ExampleValues } from '@/lib/api-example';
import type { ApiEndpoint } from '@/lib/api-reference';

/**
 * The playground, under the card that documents the endpoint.
 *
 * The values start at what the card says: path parameters and body fields are
 * seeded with the documented examples, because without them there is no request to
 * make, and query parameters are left out, because an empty query string is a real
 * choice — `GET /v1/data/query` with no `perspective` means "what a site serves",
 * which is what somebody pressing Send means.
 *
 * A route that needs a *person's* token gets no playground and says why, rather
 * than a form that answers 401 and leaves somebody to work out that this page
 * cannot hold that credential.
 */
export function TryIt({ endpoint, baseUrl }: { endpoint: ApiEndpoint; baseUrl: string }) {
  const { credential } = usePlayground();
  const [values, setValues] = useState<ExampleValues>(() => startingValues(endpoint));
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!triesInBrowser(endpoint)) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        An API token cannot call this route — it is verified at the gateway, before any handler runs,
        and only a signed-in person&rsquo;s ID token gets past. The studio and the console are its
        callers, which is why there is nothing to try here.
      </p>
    );
  }

  const needsToken = endpoint.auth !== 'none';

  async function send() {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await runEndpoint({
          endpoint,
          baseUrl,
          values,
          token: needsToken ? (credential?.token ?? '') : '',
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The request failed');
    } finally {
      setSending(false);
    }
  }

  const pathParameters = (endpoint.parameters ?? []).filter((parameter) => parameter.in === 'path');
  const queryParameters = (endpoint.parameters ?? []).filter((parameter) => parameter.in === 'query');
  const missingPath = pathParameters.some((parameter) => !values.path?.[parameter.name]);

  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium">Try it</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setValues(startingValues(endpoint));
            setResult(null);
            setError(null);
          }}
        >
          <RotateCcwIcon className="size-4" />
          Reset
        </Button>
      </div>

      {pathParameters.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {pathParameters.map((parameter) => (
            <div key={parameter.name} className="grid gap-1">
              <Label htmlFor={`${endpoint.id}-${parameter.name}`} className="font-mono text-xs">
                {parameter.name}
              </Label>
              <Input
                id={`${endpoint.id}-${parameter.name}`}
                value={values.path?.[parameter.name] ?? ''}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    path: { ...current.path, [parameter.name]: event.target.value },
                  }))
                }
                placeholder={parameter.example}
                spellCheck={false}
                className="font-mono text-xs"
              />
            </div>
          ))}
        </div>
      )}

      {queryParameters.length > 0 && (
        <details className="rounded-lg border border-border bg-card px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            {queryParameters.length} query{' '}
            {queryParameters.length === 1 ? 'parameter' : 'parameters'}
          </summary>
          <div className="mt-2 grid gap-2">
            {queryParameters.map((parameter) => (
              <div key={parameter.name} className="grid gap-1">
                <Label htmlFor={`${endpoint.id}-q-${parameter.name}`} className="font-mono text-xs">
                  {parameter.name}
                </Label>
                <Input
                  id={`${endpoint.id}-q-${parameter.name}`}
                  value={values.query?.[parameter.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      query: { ...current.query, [parameter.name]: event.target.value },
                    }))
                  }
                  placeholder={parameter.example ?? parameter.description}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>
            ))}
          </div>
        </details>
      )}

      {endpoint.body && endpoint.body.length > 0 && (
        <div className="grid gap-1">
          <Label htmlFor={`${endpoint.id}-body`} className="text-xs">
            Body
          </Label>
          <textarea
            id={`${endpoint.id}-body`}
            value={values.body?.__raw ?? bodyFor(endpoint) ?? ''}
            onChange={(event) =>
              setValues((current) => ({ ...current, body: { __raw: event.target.value } }))
            }
            rows={6}
            spellCheck={false}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void send()} disabled={sending || missingPath}>
          {sending ? <Loader2Icon className="animate-spin" /> : <SendIcon />}
          Send
        </Button>
        {missingPath && (
          <span className="text-xs text-muted-foreground">
            Fill in the path parameters first — a request to{' '}
            <span className="font-mono">{endpoint.path}</span> needs them.
          </span>
        )}
        {needsToken && !credential && !missingPath && (
          <span className="text-xs text-warning">
            No token yet — paste one above and the request will carry it.
          </span>
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {result && (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 font-mono text-xs',
                result.ok
                  ? 'bg-success/10 text-success'
                  : result.status < 500
                    ? 'bg-warning/15 text-warning'
                    : 'bg-destructive/10 text-destructive',
              )}
            >
              {result.status}
            </span>
            <span className="text-xs text-muted-foreground">{result.ms} ms</span>
          </div>
          <CodeBlock code={result.body} label="Response" />
        </div>
      )}
    </div>
  );
}

/**
 * What the boxes start with.
 *
 * Path parameters from their documented examples, because a path is not optional
 * and an empty one is not a request. Query parameters not at all, so that the first
 * Send is the plainest version of the call. A body's raw text is left unset too: the
 * textarea falls back to the example the card documents, and keeping it out of state
 * means Reset really resets it.
 */
function startingValues(endpoint: ApiEndpoint): ExampleValues {
  const path: Record<string, string> = {};
  for (const parameter of endpoint.parameters ?? []) {
    if (parameter.in === 'path') path[parameter.name] = parameter.example ?? '';
  }
  return { path };
}
