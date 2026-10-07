/**
 * `POST /v1/projects/{p}/webhooks` — make one.
 *
 * A webhook belongs to one dataset, and it is authorized as a write to that
 * dataset rather than to the project alone: a URL that is told about every
 * publish in a project is a URL that has to be trusted with all of its content,
 * and a token scoped to one dataset must not be able to point one at another.
 */

import { requireDatasetAccess, requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  created,
  jsonBody,
  pathParam,
  requiredStringField,
  stringField,
  stringListField,
  withHandler,
  type ApiEvent,
  type RouteResponse,
} from '../../lib/http';
import { createWebhook, requireEvents, requireWebhookUrl, toWebhook } from '../../lib/webhooks';

async function main(event: ApiEvent): Promise<RouteResponse> {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  // Checked before the body is read, so a caller who may not write here is
  // refused for that rather than for whatever their body happened to contain.
  await requireProjectAccess(projectId, viewer, 'write');

  const body = jsonBody(event);
  const dataset = requiredStringField(body, 'dataset');
  // The project check is made again inside this call, which is where a token's
  // dataset scope is applied — a dataset named in a body is still a dataset.
  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const record = await createWebhook({
    projectId,
    dataset,
    name: requiredStringField(body, 'name'),
    url: requireWebhookUrl(requiredStringField(body, 'url')),
    // An empty list is a webhook that fires on nothing, so `requireEvents` is
    // given the empty array rather than being skipped: the 400 it raises names
    // the events that exist, which is the answer the caller needs.
    on: requireEvents(stringListField(body, 'on') ?? []),
    // GROQ, stored as written. Whether a filter admits a document is a question
    // for the write that happens, and a projection is applied against the
    // document the event carried — neither is this route's to evaluate, and a
    // filter that is merely wrong should not stop the webhook existing.
    filter: stringField(body, 'filter') || null,
    projection: stringField(body, 'projection') || null,
  });

  // The secret is minted and stored but never returned. It is what a receiver
  // verifies a delivery with, so it has to be readable by this service at
  // delivery time — and a signing key that has been drawn on a settings screen is
  // a key that is in a screenshot, a log and a support thread. `PATCH` with
  // `rotateSecret` replaces it, which is the whole of what anybody needs to do
  // with it: signing is this API's job, not the caller's.
  return created(toWebhook(record));
}

export const handler = withHandler(main);
