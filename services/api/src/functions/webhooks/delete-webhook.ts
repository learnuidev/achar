/**
 * `DELETE /v1/projects/{p}/webhooks/{webhookId}` — delete it.
 *
 * The deliveries go with it: they are keyed by this webhook's id, so a delete
 * that left them behind would leave rows nothing could ever name again.
 */

import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { noContent, pathParam, withHandler, type ApiEvent } from '../../lib/http';
import { deleteWebhook } from '../../lib/webhooks';

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const webhookId = pathParam(event, 'webhookId');
  await requireProjectAccess(projectId, viewer, 'write');

  await deleteWebhook(projectId, webhookId);

  // 204 rather than the deleted row: the webhook is gone, and a body describing
  // it would be a copy of something no longer there for a client to trust.
  return noContent();
}

export const handler = withHandler(main);
