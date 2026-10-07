/**
 * `GET /v1/projects/{p}/webhooks` — the project's webhooks, each with its last attempt.
 *
 * Every row carries `lastDelivery`, and that costs one read per webhook. It is
 * deliberate: there are a handful of webhooks per project, and the alternative —
 * a settings screen that draws the list and then asks again per row — is the
 * same reads, later, in a shape that can disagree with itself while it loads.
 */

import type { Webhook } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler, type ApiEvent } from '../../lib/http';
import { listDeliveries, listWebhooks, toWebhook } from '../../lib/webhooks';

async function main(event: ApiEvent): Promise<Webhook[]> {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  await requireProjectAccess(projectId, viewer, 'read');

  const hooks = await listWebhooks(projectId);
  const items: Webhook[] = [];

  for (const hook of hooks) {
    const { deliveries } = await listDeliveries(hook.webhookId, { limit: 1 });
    items.push(toWebhook(hook, deliveries[0]));
  }

  // A bare array: a project holds a handful of webhooks, and the client over
  // this API reads the list as `Webhook[]`.
  return items;
}

export const handler = withHandler(main);
