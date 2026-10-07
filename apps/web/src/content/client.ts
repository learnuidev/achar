/**
 * The one place the site decides whether it is talking to a content API.
 *
 * Two states, and no third one. `NEXT_PUBLIC_ACHAR_API_URL` names a deployment —
 * the Lambda behind API Gateway, or `http://localhost:4000` for a developer
 * running the backend — and then there is a client. Unset, there is not, and
 * `src/content/index.ts` renders the seed corpus that ships with this repository.
 *
 * Nothing here throws. A marketing site whose front page depends on a network
 * call to its own backend is a front page that is down whenever the backend is,
 * and the failure mode of *this* function is what decides that: an unreadable
 * environment variable is an absent client, not a 500.
 */

import { AcharClient } from '@achar/api';

/**
 * Memoised per process, which is per server instance rather than per request: the
 * client holds nothing but a URL and a token, so building one per request would
 * only re-read the same environment variables.
 *
 * `undefined` is "not asked yet" and `null` is "asked, and there is no client" —
 * the distinction matters because `null` is the answer on most deployments and
 * should not be recomputed on every content read.
 */
let cached: AcharClient | null | undefined;

export function contentClient(): AcharClient | null {
  if (cached !== undefined) return cached;

  const apiUrl = process.env.NEXT_PUBLIC_ACHAR_API_URL;
  cached = apiUrl
    ? new AcharClient({
        apiUrl,
        // A public read token, when the dataset is `PRIVATE`. Absent for a public
        // dataset, which is the arrangement a marketing site usually wants.
        token: process.env.NEXT_PUBLIC_ACHAR_TOKEN ?? null,
      })
    : null;

  return cached;
}

/**
 * The dataset the site reads.
 *
 * Named rather than assumed, because `staging` is exactly what a site is pointed
 * at while somebody checks a page before it goes live, and a hard-coded
 * `production` would make that impossible without a code change.
 */
export function contentDataset(): string {
  return process.env.NEXT_PUBLIC_ACHAR_DATASET ?? 'production';
}

/**
 * The project the site reads its dataset out of.
 *
 * A dataset lives inside a project, and every read is addressed `/v1/data/query/{project}/{dataset}`,
 * so an API URL on its own is not enough to read anything. Undefined here means a
 * deployment has an API and nothing to ask it about, which the content layer
 * treats as "no API" — the seed is the answer, and one line in the log says why.
 */
export function contentProject(): string | undefined {
  const projectId = process.env.NEXT_PUBLIC_ACHAR_PROJECT;
  return projectId && projectId.length > 0 ? projectId : undefined;
}
