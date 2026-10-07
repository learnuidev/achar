import { cn } from '@achar/ui';

import { CodeBlock } from '@/components/docs/code-block';
import { renderEmphasis } from '@/components/docs/emphasis';
import { TryIt } from '@/components/docs/try-it';
import { curlFor } from '@/lib/api-example';
import type { ApiEndpoint, ApiField } from '@/lib/api-reference';

/**
 * One endpoint, as a card: what it is, what it takes, what comes back, and — for
 * the routes that can be called from a browser — the playground that proves it.
 *
 * The order is the order somebody reads in: the method and path first, because that
 * is what they searched for; then **who may call it**, because that decides whether
 * the rest is any use to them; then what it wants; then the answer; then the notes,
 * which are the things the other four sections cannot hold — a 404 that means
 * "draft only", a cascade order that matters, a rule that is easy to get wrong.
 *
 * The `curl` is built from the endpoint rather than written beside it, so a field
 * that changes cannot leave a wrong example behind it.
 */
export function EndpointCard({ endpoint, baseUrl }: { endpoint: ApiEndpoint; baseUrl: string }) {
  const pathParameters = (endpoint.parameters ?? []).filter((parameter) => parameter.in === 'path');
  const queryParameters = (endpoint.parameters ?? []).filter((parameter) => parameter.in === 'query');

  return (
    <section id={endpoint.id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <MethodBadge method={endpoint.method} />
          {/* Truncated rather than wrapped: a path is one token, and a card whose
              header is four lines tall is a card nobody scans. The title carries
              the whole thing. */}
          <span
            className="min-w-0 truncate font-mono text-sm text-foreground"
            title={endpoint.path}
          >
            {endpoint.path}
          </span>
          <AuthBadge auth={endpoint.auth} />
        </div>

        <div className="space-y-1">
          <h3 className="text-base font-medium">{endpoint.summary}</h3>
          <p className="text-sm text-muted-foreground">{renderEmphasis(endpoint.description)}</p>
        </div>
      </header>

      {(pathParameters.length > 0 || queryParameters.length > 0 || endpoint.body?.length) && (
        <div className="mt-4 space-y-4">
          {pathParameters.length > 0 && <FieldTable title="Path" fields={pathParameters} />}
          {queryParameters.length > 0 && <FieldTable title="Query" fields={queryParameters} />}
          {endpoint.body && endpoint.body.length > 0 && (
            <FieldTable title="Body" fields={endpoint.body} />
          )}
        </div>
      )}

      <div className="mt-4 space-y-3">
        <CodeBlock code={curlFor(endpoint, baseUrl)} label="cURL" />

        {endpoint.responseExample && (
          <CodeBlock code={endpoint.responseExample} label={endpoint.responseStatus} />
        )}
        {!endpoint.responseExample && (
          <p className="text-xs text-muted-foreground">
            Answers <span className="font-mono">{endpoint.responseStatus}</span> with no body.
          </p>
        )}

        {endpoint.responseFields && endpoint.responseFields.length > 0 && (
          <FieldTable title="Response" fields={endpoint.responseFields} />
        )}
      </div>

      {endpoint.notes && endpoint.notes.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {endpoint.notes.map((note) => (
            <li key={note} className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-muted-foreground" />
              <span>{renderEmphasis(note)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <TryIt endpoint={endpoint} baseUrl={baseUrl} />
      </div>
    </section>
  );
}

/** The verbs, coloured the way a terminal colours them. */
function MethodBadge({ method }: { method: ApiEndpoint['method'] }) {
  const tone =
    method === 'GET'
      ? 'bg-info/10 text-info'
      : method === 'POST'
        ? 'bg-success/10 text-success'
        : method === 'DELETE'
          ? 'bg-destructive/10 text-destructive'
          : 'bg-warning/15 text-warning';

  return (
    <span className={cn('rounded-md px-2 py-0.5 font-mono text-xs font-medium', tone)}>
      {method}
    </span>
  );
}

/**
 * Whether a credential is needed — the one fact that decides whether a reader keeps
 * reading.
 *
 * Said in words rather than in a legend, because a footnote elsewhere on the page is
 * a footnote a reader does not have. Every route here is one an API token reaches, so
 * the badge never has to say which kind of caller it means: the only two answers are
 * that there is no credential and that the credential is a token.
 */
function AuthBadge({ auth }: { auth: ApiEndpoint['auth'] }) {
  const label = auth === 'none' ? 'No credential' : 'API token';
  const tone =
    auth === 'none' ? 'border-border text-muted-foreground' : 'border-primary/40 text-primary';

  return (
    <span className={cn('rounded-full border px-2 py-0.5 text-xs', tone)} title={authTitle(auth)}>
      {label}
    </span>
  );
}

function authTitle(auth: ApiEndpoint['auth']): string {
  return auth === 'none'
    ? 'Anyone. This route is the one that answers without a credential.'
    : 'An API token, verified by the handler. This is the credential a script or a site uses, and the one the playground can hold.';
}

/** A table of fields, in the order the card documents them. */
function FieldTable({ title, fields }: { title: string; fields: ApiField[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-left text-sm">
        <caption className="border-b border-border bg-muted/40 px-3 py-1.5 text-left text-xs font-medium text-muted-foreground">
          {title}
        </caption>
        <tbody className="divide-y divide-border">
          {fields.map((field) => (
            <tr key={field.name} className="align-top">
              <td className="px-3 py-2">
                <span className="font-mono text-xs text-foreground">{field.name}</span>
                {field.required && <span className="ml-1 text-xs text-destructive">*</span>}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{field.type}</td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {renderEmphasis(field.description)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
