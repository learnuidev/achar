/**
 * What a write tells a webhook about.
 *
 * Here rather than in the route that writes, because there are two routes that write
 * content — the mutation batch and the translation — and a receiver that heard about
 * an editor's save but not about a model's translation would be a rebuilding site
 * that quietly stopped rebuilding the day somebody pressed Translate.
 */

import type { AcharDocument, MutationOperation, MutationResult, WebhookEvent } from '@achar/types';

import { getDocument } from './documents';
import { queueWebhookEvents } from './webhooks';

/**
 * Queues an event per document a batch changed.
 *
 * The document is read back at `raw` rather than threaded out of `applyMutations`:
 * what a receiver is told should be the document as it stands now, which for a
 * publish is the published row and for an unpublish is the draft that survived. The
 * last operation on a document wins when a batch touched it more than once, because
 * "created and then edited" is one change to everything outside this API.
 *
 * The document travels **as stored** — every language at once. A receiver is a
 * machine, and a machine told only one language has no way to know the others exist;
 * a consumer that wants one has the query API and `?language=`.
 */
export async function notify(
  projectId: string,
  dataset: string,
  results: Pick<MutationResult, 'documentId' | 'operation'>[],
): Promise<void> {
  const latest = new Map<string, MutationOperation>();
  for (const result of results) latest.set(result.documentId, result.operation);

  for (const [documentId, operation] of latest) {
    const document: AcharDocument | undefined = await getDocument(
      projectId,
      dataset,
      documentId,
      'raw',
      false,
    );
    await queueWebhookEvents({
      projectId,
      dataset,
      event: eventOf(operation),
      documentId,
      document: document ?? null,
    });
  }
}

/**
 * A mutation as the event a receiver subscribes to.
 *
 * There are four events and more mutations, and the ones without an event of their
 * own are edits: `unpublish` is content changing, and a receiver that wanted to know
 * about publications says so by subscribing to `publish` alone. `approve` is an edit
 * too — the text does not move, but what a reader is being told about it does.
 */
export function eventOf(operation: MutationOperation): WebhookEvent {
  if (operation === 'create') return 'create';
  if (operation === 'delete') return 'delete';
  if (operation === 'publish') return 'publish';
  return 'update';
}
