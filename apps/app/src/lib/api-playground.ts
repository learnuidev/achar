import type { ApiEndpoint } from '@/lib/api-reference';
import { bodyFor, pathFor, type ExampleValues } from '@/lib/api-example';

/**
 * Sending a request from the page.
 *
 * The playground is the one part of a reference that cannot be read: everything
 * else on the page says what a route does, and this says what it does *here*, with
 * your token, against your dataset. A reader who has just minted a token and wants
 * to see something real come back is the reader this exists for.
 *
 * It calls the deployment this site itself reads content from — the same base URL
 * the studio and the public pages use — so a successful response here is a fact
 * about that deployment and not about a mock. There is no proxy and no server of
 * ours in the middle: the request goes from the browser to the API, which is why
 * CORS is configured on the API for exactly these origins.
 *
 * Every route in this reference takes an API token, because that is what the
 * reference is: the routes a gateway authorizer would refuse were left out of it.
 */

export interface PlaygroundResult {
  status: number;
  ok: boolean;
  ms: number;
  /** The response as it arrived, pretty-printed when it was JSON. */
  body: string;
  contentType: string;
}

export interface RunInput {
  endpoint: ApiEndpoint;
  baseUrl: string;
  values: ExampleValues;
  /** The API token, or nothing for the routes that need no credential. */
  token: string;
}

export async function runEndpoint(input: RunInput): Promise<PlaygroundResult> {
  const url = pathFor(input.endpoint, input.baseUrl, input.values);
  const body = bodyFor(input.endpoint, input.values);
  const started = performance.now();

  let response: Response;
  try {
    response = await fetch(url, {
      method: input.endpoint.method,
      headers: {
        ...(input.token ? { authorization: `Bearer ${input.token}` } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body } : {}),
    });
  } catch (cause) {
    // A request that never left is not a status, and pretending it was one would
    // be the page's own invention. CORS is the usual reason here.
    throw new Error(
      cause instanceof Error
        ? `${cause.message} — a request from this page has to be allowed by the API's CORS configuration.`
        : 'The request did not reach the API',
    );
  }

  const text = await response.text();
  const contentType = response.headers.get('content-type') ?? '';

  return {
    status: response.status,
    ok: response.ok,
    ms: Math.round(performance.now() - started),
    body: pretty(text, contentType),
    contentType,
  };
}

/** JSON as JSON, and anything else as it came — a 204 has no body at all. */
function pretty(text: string, contentType: string): string {
  if (text === '') return '(no content)';
  if (!contentType.includes('json')) return text;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
