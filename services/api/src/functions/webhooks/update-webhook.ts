/**
 * `PATCH /v1/projects/{p}/webhooks/{webhookId}` — change it, or take it out of service.
 *
 * The dataset is not patchable. A webhook's deliveries are logged against it and
 * its filter was written about that dataset's documents, so moving one is a
 * different webhook rather than an edit — and `DELETE` plus `POST` is what says
 * so honestly.
 */

import type { Webhook } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  booleanField,
  jsonBody,
  pathParam,
  requiredStringField,
  stringField,
  stringListField,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import {
  requireEvents,
  requireWebhookUrl,
  toWebhook,
  updateWebhook,
  type UpdateWebhookInput,
} from '../../lib/webhooks';

async function main(event: ApiEvent): Promise<Webhook> {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const webhookId = pathParam(event, 'webhookId');
  await requireProjectAccess(projectId, viewer, 'write');

  const body = jsonBody(event);
  const patch: UpdateWebhookInput = {};

  // Only what the body carried is patched, and presence is what `in` asks: a
  // field absent from the request is a field the caller did not mention, which is
  // not the same as one they sent as `null` — see `filter` below, where the
  // difference is the whole point.
  if ('name' in body) patch.name = requiredStringField(body, 'name');

  const url = stringField(body, 'url');
  if (url !== undefined) patch.url = requireWebhookUrl(url);

  const on = stringListField(body, 'on');
  if (on !== undefined) patch.on = requireEvents(on);

  // `null`, or the empty string a form sends for a field somebody cleared, both
  // mean clear it. A filter that cannot be taken off a webhook is a webhook
  // nobody can un-filter without deleting it and losing the delivery log that
  // would have shown them what it had been doing.
  if ('filter' in body) patch.filter = stringField(body, 'filter') || null;
  if ('projection' in body) patch.projection = stringField(body, 'projection') || null;

  const enabled = booleanField(body, 'enabled');
  if (enabled !== undefined) patch.enabled = enabled;

  // Taking a webhook out of service is `enabled: false` rather than a delete,
  // because the deliveries it has already made are worth keeping and because
  // putting it back should not mean a new id and a new secret.
  const rotateSecret = booleanField(body, 'rotateSecret');
  if (rotateSecret !== undefined) patch.rotateSecret = rotateSecret;

  return toWebhook(await updateWebhook(projectId, webhookId, patch));
}

export const handler = withHandler(main);
