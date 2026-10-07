import type { ApiEndpoint } from '@/lib/api-reference';

/**
 * The examples, built from the endpoint rather than written beside it.
 *
 * A reference has two sources of truth for the same thing when the examples are
 * prose: the card that documents `role` as one of three strings, and the `curl`
 * three lines down that says `"role": "EDITOR"`. Building the second from the
 * first means a field that gains a value cannot leave a wrong example behind it.
 *
 * What the examples use for the credential is a shell variable — `$ACHAR_TOKEN` —
 * rather than a placeholder, because the example is meant to be pasted: a reader
 * who has a token in their environment runs it as it stands, and one who does not
 * can see exactly which part is theirs to fill in.
 */

/** The values a request is built from: what the playground has in its boxes. */
export interface ExampleValues {
  path?: Record<string, string>;
  query?: Record<string, string>;
  body?: Record<string, string>;
}

/** The path, with every `{param}` replaced by what the caller has for it. */
export function pathFor(endpoint: ApiEndpoint, baseUrl: string, values: ExampleValues = {}): string {
  const filled = endpoint.path.replace(/\{([A-Za-z0-9_]+)\}/g, (whole, name: string) => {
    const value = values.path?.[name];
    return value ? encodeURIComponent(value) : whole;
  });

  const query = new URLSearchParams();
  for (const parameter of endpoint.parameters ?? []) {
    if (parameter.in !== 'query') continue;
    const value = values.query?.[parameter.name] ?? parameter.example;
    if (value) query.set(parameter.name, value);
  }

  const search = query.toString();
  return `${baseUrl}${filled}${search ? `?${search}` : ''}`;
}

/**
 * The body, as JSON.
 *
 * `__raw` wins when it is set, and it is what the playground's textarea holds: a
 * person who edits the body is editing *the request*, and rebuilding it from the
 * documented fields afterwards would silently throw their edit away. Everywhere else
 * the body is built from the fields the card documents.
 */
export function bodyFor(endpoint: ApiEndpoint, values: ExampleValues = {}): string | null {
  const raw = values.body?.__raw;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  if (!endpoint.body?.length) return null;

  const body: Record<string, unknown> = {};
  for (const field of endpoint.body) {
    const raw = values.body?.[field.name] ?? field.example ?? '';
    body[field.name] = valueOf(field.type, raw);
  }

  return JSON.stringify(body, null, 2);
}

/**
 * A field's value as the type it says.
 *
 * The examples are written as text — that is what a `curl` is — but a body that
 * sent `"limit": "20"` would be documenting a request the API refuses, so what a
 * card says a field *is* decides how it is written: numbers as numbers, booleans
 * as booleans, a JSON array or object as itself, and everything else as a string.
 */
function valueOf(type: string, raw: string): unknown {
  if (raw === '') return '';

  const lower = type.toLowerCase();
  if (lower.startsWith('integer') || lower.startsWith('number')) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (lower.startsWith('boolean')) return raw === 'true';
  if (lower.startsWith('json') || lower.endsWith('[]') || raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      // A half-written example is not a reason to print a broken one: the string
      // is what was typed, and the response will say so.
      return raw;
    }
  }
  return raw;
}

/**
 * The `curl` for an endpoint, as a command somebody can run.
 *
 * One shape for both credentials, because they are one header: an API token and a
 * person's ID token are both `Authorization: Bearer`, and what changes is which
 * routes will accept them — which the card says above the block.
 */
export function curlFor(endpoint: ApiEndpoint, baseUrl: string, values: ExampleValues = {}): string {
  const url = pathFor(endpoint, baseUrl, values);
  const body = bodyFor(endpoint, values);

  const lines = [`curl -X ${endpoint.method} '${url}'`];
  if (endpoint.auth !== 'none') {
    lines.push(`  -H 'Authorization: Bearer $ACHAR_TOKEN'`);
  }
  if (body) lines.push(`  -H 'content-type: application/json'`, `  -d '${body.replace(/\n\s*/g, '')}'`);

  return lines.join(' \\\n');
}
