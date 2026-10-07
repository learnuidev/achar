/**
 * The webhook delivery function — the consumer behind every event a write queues.
 *
 * This is not an HTTP route and does not use `withHandler`: nothing here has a
 * caller to answer, and the two answers that mean anything are "delivered" and
 * "put it back on the queue". A thrown `HttpError` would be answered with a
 * status code nobody reads, which is why a failure is reported as a batch item
 * failure instead.
 *
 * A write never calls a webhook itself. It puts a message on the queue and
 * returns, so that the studio's save button is a promise about the studio's own
 * content rather than about somebody else's endpoint — see `lib/webhooks.ts`.
 * What happens here is the other half of that trade: the endpoint is called from
 * a place where being slow, or being down, costs nobody their save.
 */

import type { WebhookPayload } from '@achar/types';
import { applyProjection } from '../../lib/groq';
import { ulid } from '../../lib/ids';
import { getWebhook, recordDelivery, signPayload, type WebhookMessage } from '../../lib/webhooks';

export interface QueueRecord {
  messageId: string;
  body: string;
  /** SQS's own counting, which is where the attempt number comes from. */
  attributes?: { ApproximateReceiveCount?: string };
}

export interface QueueEvent {
  Records: QueueRecord[];
}

export interface BatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

/**
 * How long a receiver has to answer.
 *
 * Bounded because the invocation holds the whole batch: an endpoint that accepts
 * a connection and then says nothing would otherwise keep every other message in
 * the batch invisible on the queue for as long as its visibility timeout lasts,
 * and a batch of slow receivers would take the invocation's whole budget.
 */
const DELIVERY_TIMEOUT_MS = 10_000;

/** Attempts this function makes before it stops reporting the message as failed. */
const MAX_ATTEMPTS = 3;

export const handler = async (event: QueueEvent): Promise<BatchResponse> => {
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    if (await deliver(record)) batchItemFailures.push({ itemIdentifier: record.messageId });
  }

  return { batchItemFailures };
};

/** Sends one message, and answers whether the queue should try it again. */
async function deliver(record: QueueRecord): Promise<boolean> {
  const message = parseMessage(record.body);
  if (!message) {
    // Logged and dropped. Nothing downstream can make unreadable bytes readable,
    // so a retry produces the same failure twice more and then the redrive policy
    // discards it anyway — the difference being that the log line has moved from
    // the function that can see it to a dead-letter queue nobody is watching.
    console.error('Dropping an unreadable webhook message', record.messageId, record.body);
    return false;
  }

  const hook = await getWebhook(message.projectId, message.webhookId);
  if (!hook || !hook.enabled) {
    // Nothing is recorded. A delivery log is the record of what this API tried to
    // send, and a webhook that has been deleted, or taken out of service with
    // `enabled: false`, was not tried — a row here would say the endpoint ignored
    // a delivery it was never sent.
    return false;
  }

  // The document comes off the message rather than out of the table: a delivery
  // says what happened at a moment, and the row may have been written twice
  // since. The projection is applied here, to that document, for the same
  // reason — a webhook told about a publish should be told what was published.
  const document = hook.projection
    ? await applyProjection(hook.projection, message.document)
    : message.document;

  const payload: WebhookPayload = {
    projectId: message.projectId,
    dataset: message.dataset,
    event: message.event,
    documentId: message.documentId,
    at: message.at,
    document,
  };

  const body = JSON.stringify(payload);
  const deliveryId = ulid();
  const startedAt = Date.now();

  let statusCode: number | null = null;
  let error: string | null = null;
  let retryable = false;

  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-achar-event': message.event,
        // The delivery id is the identifier in the log and in the header, so a
        // receiver that reports a problem and a row in `DeliveriesTable` are the
        // same event rather than two things to correlate by timestamp.
        'x-achar-delivery': deliveryId,
        'x-achar-signature': signPayload(body, hook.secret),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    statusCode = response.status;
    if (!response.ok) {
      error = `Endpoint answered ${response.status}`;
      retryable = response.status >= 500;
    }
  } catch (caught) {
    // A timeout or a refused connection is the same answer as a 5xx: the request
    // may never have arrived, so there is nothing that could have accepted it.
    error = caught instanceof Error ? caught.message : String(caught);
    retryable = true;
  }

  const attempt = Number(record.attributes?.ApproximateReceiveCount ?? '1');
  const succeeded = statusCode !== null && statusCode < 400;

  await recordDelivery({
    deliveryId,
    webhookId: hook.webhookId,
    documentId: message.documentId,
    event: message.event,
    at: message.at,
    attempt,
    status: succeeded ? 'SUCCESS' : 'FAILED',
    statusCode,
    durationMs: Date.now() - startedAt,
    error,
  });

  // A 4xx is recorded and dropped. The receiver understood the request and
  // refused it, and a body it has already rejected is a body it will reject
  // identically three more times — which is how one mistyped URL becomes an
  // incident somebody is paged for. Only a failure that might have been the
  // network's is worth another attempt.
  if (!retryable) return false;

  // Bounded deliberately, even though the queue's own redrive policy already
  // counts receives and would stop a message on its own. What this adds is a
  // limit that does not depend on that policy being configured as intended, and
  // a log line at the moment the API gives up — so the last row in the delivery
  // log reads as a decision rather than as one more failure among the rest.
  if (attempt >= MAX_ATTEMPTS) {
    console.error('Giving up on a webhook delivery', deliveryId, hook.url, error);
    return false;
  }

  return true;
}

/**
 * The message as `WebhookMessage`, or `null` when the body is not one.
 *
 * The two ids are checked rather than assumed. A body that parses into `{}` is as
 * unusable as one that does not parse at all, and every field after them is used
 * only to build a payload — where a missing one is visible to the receiver, and
 * not a reason to spend a lookup on a message this API cannot act on.
 */
function parseMessage(body: string): WebhookMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  const message = parsed as Partial<WebhookMessage>;
  if (typeof message.projectId !== 'string' || typeof message.webhookId !== 'string') return null;

  return message as WebhookMessage;
}
