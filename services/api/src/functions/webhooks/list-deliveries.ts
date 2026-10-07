/**
 * `GET /v1/projects/{p}/webhooks/{webhookId}/deliveries` — what a webhook has been told.
 *
 * Newest first, because the question this route is opened to answer is "did the
 * thing I just published arrive", and a log read from the beginning answers it
 * only after paging to the end.
 */

import type { ListResponse, WebhookDelivery } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  HttpError,
  encodeNextToken,
  parsePaging,
  pathParam,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import { getWebhook, listDeliveries } from '../../lib/webhooks';

async function main(event: ApiEvent): Promise<ListResponse<WebhookDelivery>> {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const webhookId = pathParam(event, 'webhookId');
  await requireProjectAccess(projectId, viewer, 'read');

  // Loaded before anything is paged. A delivery is keyed by its webhook's id
  // alone, so without this read the id in the path would be enough to page the
  // delivery log of a webhook in a project the caller has nothing to do with.
  const hook = await getWebhook(projectId, webhookId);
  if (!hook) throw new HttpError(404, 'NOT_FOUND', 'Webhook not found');

  const { limit, exclusiveStartKey } = parsePaging(event);
  const page = await listDeliveries(webhookId, {
    limit,
    ...(exclusiveStartKey ? { exclusiveStartKey } : {}),
  });

  return { items: page.deliveries, nextToken: encodeNextToken(page.lastEvaluatedKey) };
}

export const handler = withHandler(main);
