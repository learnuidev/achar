/**
 * Webhooks — a URL told when content changes.
 *
 * A write never calls a webhook. It puts an event on a queue and returns, and
 * the delivery function behind that queue is what signs and sends it. The reason
 * is not throughput, it is that a content save must not be able to fail because
 * somebody's endpoint is down: the studio's save button is a promise about the
 * studio's own content, and a webhook is a third party that this API cannot
 * speak for.
 *
 * The filter is evaluated here, before the message is queued, rather than by the
 * delivery function — so a webhook scoped to `_type == "post"` costs nothing at
 * all when somebody edits a `faq`. The projection is applied at delivery time,
 * against the document carried in the message, because what a webhook is told
 * has to be what changed and not whatever the document has become since.
 *
 * The enqueue is one `SendMessage` through `@aws-sdk/client-sqs` — a declared
 * dependency of this service rather than a request signed by hand against a
 * package that merely happened to be in the tree. What matters either way is the
 * shape: the send is awaited on the write path so the event is on the queue
 * before the response, and a failure to queue is logged and swallowed, because a
 * queue nobody can reach must not be a save nobody can make.
 */

import { createHmac } from 'node:crypto';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import type { Webhook, WebhookDelivery, WebhookEvent } from '@achar/types';
import { WEBHOOK_EVENTS } from '@achar/types';
import {
  Keys,
  deleteItem,
  getItem,
  putIfAbsent,
  putItem,
  query,
  queryAll,
  tryUpdateItem,
  type Item,
  type Key,
} from './dynamo';
import { env } from './env';
import { HttpError } from './http';
import { secret, ulid } from './ids';
import { matchesFilter } from './groq';

export interface WebhookRecord extends Item {
  projectId: string;
  webhookId: string;
  dataset: string;
  name: string;
  url: string;
  on: WebhookEvent[];
  /** GROQ, evaluated when an event happens. */
  filter?: string | null;
  /** GROQ, applied to the document the payload carries. */
  projection?: string | null;
  /** The signing key. Stored in the clear because signing needs it; never returned. */
  secret: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export const DELIVERY_RETENTION_DAYS = 30;

export function toWebhook(record: WebhookRecord, lastDelivery?: WebhookDelivery | null): Webhook {
  return {
    webhookId: record.webhookId,
    projectId: record.projectId,
    dataset: record.dataset,
    name: record.name,
    url: record.url,
    on: record.on,
    filter: record.filter ?? null,
    projection: record.projection ?? null,
    // Whether there is a secret, never what it is: it is what signs the
    // deliveries a receiver verifies, and a value that is handed out on a list
    // screen is not a signing key.
    hasSecret: Boolean(record.secret),
    enabled: record.enabled,
    createdAt: record.createdAt,
    lastDelivery: lastDelivery ?? null,
  };
}

export function requireWebhookUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'url must be an absolute URL', { field: 'url' });
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new HttpError(400, 'BAD_REQUEST', 'url must be http or https', { field: 'url' });
  }
  return value;
}

export function requireEvents(value: string[]): WebhookEvent[] {
  const events = value.filter((event): event is WebhookEvent =>
    (WEBHOOK_EVENTS as readonly string[]).includes(event),
  );
  if (events.length === 0) {
    throw new HttpError(400, 'BAD_REQUEST', `on must name one of ${WEBHOOK_EVENTS.join(', ')}`, {
      field: 'on',
    });
  }
  return [...new Set(events)];
}

export async function listWebhooks(projectId: string): Promise<WebhookRecord[]> {
  return queryAll<WebhookRecord>('WebhooksTable', {
    keyCondition: '#projectId = :projectId',
    names: { '#projectId': 'projectId' },
    values: { ':projectId': projectId },
  });
}

export async function getWebhook(
  projectId: string,
  webhookId: string,
): Promise<WebhookRecord | undefined> {
  return getItem<WebhookRecord>('WebhooksTable', Keys.webhook(projectId, webhookId));
}

export interface CreateWebhookInput {
  projectId: string;
  dataset: string;
  name: string;
  url: string;
  on: WebhookEvent[];
  filter?: string | null;
  projection?: string | null;
}

export async function createWebhook(input: CreateWebhookInput): Promise<WebhookRecord> {
  const now = new Date().toISOString();
  const record: WebhookRecord = {
    projectId: input.projectId,
    webhookId: `wh_${ulid()}`,
    dataset: input.dataset,
    name: input.name,
    url: input.url,
    on: input.on,
    filter: input.filter ?? null,
    projection: input.projection ?? null,
    secret: secret(32),
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };

  const written = await putIfAbsent('WebhooksTable', record as unknown as Item, 'webhookId');
  if (!written) throw new HttpError(409, 'CONFLICT', 'That webhook id is already in use');
  return record;
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  on?: WebhookEvent[];
  filter?: string | null;
  projection?: string | null;
  enabled?: boolean;
  /** Replaces the signing key, which is the only way to rotate one. */
  rotateSecret?: boolean;
}

export async function updateWebhook(
  projectId: string,
  webhookId: string,
  patch: UpdateWebhookInput,
): Promise<WebhookRecord> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.url !== undefined) set.url = patch.url;
  if (patch.on !== undefined) set.on = patch.on;
  if (patch.filter !== undefined) set.filter = patch.filter;
  if (patch.projection !== undefined) set.projection = patch.projection;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.rotateSecret) set.secret = secret(32);

  const updated = await tryUpdateItem<WebhookRecord>(
    'WebhooksTable',
    Keys.webhook(projectId, webhookId),
    {
      set,
      condition: 'attribute_exists(#key)',
      names: { '#key': 'webhookId' },
      returnValues: 'ALL_NEW',
    },
  );
  if (!updated.item) throw new HttpError(404, 'NOT_FOUND', 'Webhook not found');
  return updated.item;
}

/**
 * Deletes a webhook, its deliveries first.
 *
 * The deliveries are the children here and they are keyed by the webhook's id,
 * so they are unreachable the moment it goes — which is the one case where
 * leaving them behind would be leaving rows nothing can ever name again.
 */
export async function deleteWebhook(projectId: string, webhookId: string): Promise<WebhookRecord> {
  const existing = await getWebhook(projectId, webhookId);
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Webhook not found');

  await deleteDeliveriesOf(webhookId);
  const removed = await deleteItem('WebhooksTable', Keys.webhook(projectId, webhookId), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'webhookId' },
  });
  if (!removed.deleted) throw new HttpError(404, 'NOT_FOUND', 'Webhook not found');
  return existing;
}

/** Removes every webhook of a project, with their deliveries. The cascade. */
export async function deleteWebhooksOfProject(projectId: string): Promise<number> {
  const rows = await listWebhooks(projectId);
  let removed = 0;
  for (const row of rows) {
    await deleteDeliveriesOf(row.webhookId);
    const result = await deleteItem('WebhooksTable', Keys.webhook(projectId, row.webhookId));
    if (result.deleted) removed += 1;
  }
  return removed;
}

async function deleteDeliveriesOf(webhookId: string): Promise<void> {
  const deliveries = await queryAll<WebhookDelivery>('DeliveriesTable', {
    keyCondition: '#webhookId = :webhookId',
    names: { '#webhookId': 'webhookId' },
    values: { ':webhookId': webhookId },
  });
  for (const delivery of deliveries) {
    await deleteItem('DeliveriesTable', Keys.delivery(webhookId, delivery.deliveryId));
  }
}

export interface DeliveryPage {
  deliveries: WebhookDelivery[];
  lastEvaluatedKey?: Key;
}

export async function listDeliveries(
  webhookId: string,
  options: { limit: number; exclusiveStartKey?: Key },
): Promise<DeliveryPage> {
  const page = await query<WebhookDelivery>('DeliveriesTable', {
    keyCondition: '#webhookId = :webhookId',
    names: { '#webhookId': 'webhookId' },
    values: { ':webhookId': webhookId },
    limit: options.limit,
    // Delivery ids are ULIDs, so the newest attempt is the last one written.
    scanIndexForward: false,
    ...(options.exclusiveStartKey ? { exclusiveStartKey: options.exclusiveStartKey } : {}),
  });

  return {
    deliveries: page.items,
    ...(page.lastEvaluatedKey ? { lastEvaluatedKey: page.lastEvaluatedKey } : {}),
  };
}

/**
 * Records one attempt.
 *
 * The row carries `expiresAt` rather than being cleaned up by a job: a delivery
 * log is the most numerous thing this API writes and the least valuable a month
 * later, so DynamoDB's own TTL is exactly the right amount of machinery. Nothing
 * reads `expiresAt` — it exists for the table's TTL to find.
 */
export async function recordDelivery(delivery: WebhookDelivery): Promise<void> {
  const expiresAt = Math.floor(Date.now() / 1000) + DELIVERY_RETENTION_DAYS * 24 * 60 * 60;
  await putItem('DeliveriesTable', { ...delivery, expiresAt } as unknown as Item);
}

/** What travels on the queue: everything the delivery function needs, and nothing it has to look up. */
export interface WebhookMessage {
  projectId: string;
  dataset: string;
  webhookId: string;
  event: WebhookEvent;
  documentId: string;
  at: string;
  /** The document as it was when the event happened. `null` for a delete of something already gone. */
  document: unknown;
}

export interface QueueInput {
  projectId: string;
  dataset: string;
  event: WebhookEvent;
  documentId: string;
  document: unknown;
}

/**
 * Queues an event for every webhook it is for.
 *
 * A failure to queue is logged and swallowed. The alternative — failing the
 * content write because a queue is unavailable — trades a webhook for the save
 * that produced it, and the save is the thing the caller asked for. The count is
 * returned so a handler can log what it did.
 */
export async function queueWebhookEvents(input: QueueInput): Promise<number> {
  const hooks = (await listWebhooks(input.projectId)).filter(
    (hook) => hook.enabled && hook.dataset === input.dataset && hook.on.includes(input.event),
  );
  if (hooks.length === 0) return 0;

  const at = new Date().toISOString();
  let queued = 0;

  for (const hook of hooks) {
    if (hook.filter) {
      const matched = await matchesFilter(hook.filter, input.document);
      if (!matched) continue;
    }

    const message: WebhookMessage = {
      projectId: input.projectId,
      dataset: input.dataset,
      webhookId: hook.webhookId,
      event: input.event,
      documentId: input.documentId,
      at,
      document: input.document,
    };

    try {
      await sendToQueue(message);
      queued += 1;
    } catch (error) {
      console.error('Could not queue a webhook event', hook.webhookId, error);
    }
  }

  return queued;
}

/**
 * Signs a payload the way a receiver verifies it: HMAC-SHA256 over the body.
 *
 * The algorithm is in the header rather than implied, so that a receiver can
 * tell a key rotation from a broken signature — and so that a future scheme can
 * be added without every receiver having to guess which one it is looking at.
 */
export function signPayload(body: string, signingSecret: string): string {
  return `sha256=${createHmac('sha256', signingSecret).update(body, 'utf8').digest('hex')}`;
}

/**
 * One `SendMessage` to the queue.
 *
 * The client is built on first use and kept, like every other client in this
 * library: a container that delivers a batch of events opens one connection
 * pool rather than one per message.
 */
let queue: SQSClient | undefined;

function sqs(): SQSClient {
  queue ??= new SQSClient({});
  return queue;
}

async function sendToQueue(message: WebhookMessage): Promise<void> {
  await sqs().send(
    new SendMessageCommand({
      QueueUrl: env.webhookQueueUrl,
      MessageBody: JSON.stringify(message),
    }),
  );
}
