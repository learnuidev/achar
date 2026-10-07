/**
 * `POST /v1/data/mutate/{p}/{d}` — an ordered batch of mutations.
 *
 * The batch is the unit rather than the request: a `create` followed by a
 * `patch` of the same document is how a studio saves a document it has just
 * made, and splitting that into two requests would leave a half-made document
 * behind whenever the second failed. `atomic: true` goes further and makes the
 * whole batch one transaction, which is the only way to say "all of this or none
 * of it" — see `applyMutations`.
 *
 * Webhooks are queued after the content is written and never before it: an event
 * is a notification that something happened, and the something has to have
 * happened. A queue that is unavailable is logged and does not fail the write.
 */

import type { AcharDocument, DocumentMutation, MutationOperation, WebhookEvent } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { applyMutations, getDocument } from '../../lib/documents';
import { recordDatasetChange } from '../../lib/datasets';
import {
  HttpError,
  booleanField,
  json,
  jsonBody,
  listField,
  pathParam,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import { assertValidDocument, getDatasetSchema } from '../../lib/schemas';
import { queueWebhookEvents } from '../../lib/webhooks';

/** Exactly one of these names each element of a batch, and that is the shape. */
const OPERATIONS = [
  'create',
  'createOrReplace',
  'createIfNotExists',
  'patch',
  'delete',
  'publish',
  'unpublish',
] as const;

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const mutations = assertMutations(listField(body, 'mutations') ?? []);
  const atomic = booleanField(body, 'atomic') ?? false;

  // Read once for the whole batch rather than per mutation: the schema is what
  // decides whether a document is a document, and a batch that fetched it three
  // times would be three reads of a row that cannot change underneath it.
  const schema = await getDatasetSchema(projectId, dataset);
  const validate = (document: AcharDocument): void => assertValidDocument(schema, document);

  const applied = await applyMutations({
    projectId,
    dataset,
    mutations,
    atomic,
    validate,
  });

  if (applied.created || applied.deleted) {
    await recordDatasetChange(projectId, dataset, {
      documents: applied.created - applied.deleted,
      mutated: true,
    });
  } else {
    await recordDatasetChange(projectId, dataset, { mutated: true });
  }

  await notify(projectId, dataset, applied.results);

  return json({ results: applied.results, transactionId: applied.transactionId });
}

/**
 * Queues an event per document the batch changed.
 *
 * The document is read back at `raw` rather than threaded out of
 * `applyMutations`: what a receiver is told should be the document as it stands
 * now, which for a publish is the published row and for an unpublish is the
 * draft that survived. The last operation on a document wins when a batch
 * touched it more than once, because "created and then edited" is one change to
 * everything outside this API.
 */
async function notify(
  projectId: string,
  dataset: string,
  results: { documentId: string; operation: MutationOperation }[],
): Promise<void> {
  const latest = new Map<string, MutationOperation>();
  for (const result of results) latest.set(result.documentId, result.operation);

  for (const [documentId, operation] of latest) {
    const document = await getDocument(projectId, dataset, documentId, 'raw', false);
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
 * There are four events and six mutations, and the two that do not have one of
 * their own are the two that are edits: `unpublish` is content changing, and a
 * receiver that wanted to know about publications says so by subscribing to
 * `publish` alone.
 */
function eventOf(operation: MutationOperation): WebhookEvent {
  if (operation === 'create') return 'create';
  if (operation === 'delete') return 'delete';
  if (operation === 'publish') return 'publish';
  return 'update';
}

/**
 * The batch, checked before anything is written.
 *
 * An element that names two operations would otherwise be applied as whichever
 * this API happened to test first, which is a silent choice made on a caller's
 * behalf. An element that names none is a typo that would disappear.
 */
function assertMutations(value: unknown[]): DocumentMutation[] {
  if (value.length === 0) {
    throw new HttpError(400, 'BAD_REQUEST', 'mutations must name at least one mutation', {
      field: 'mutations',
    });
  }

  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new HttpError(400, 'BAD_REQUEST', `mutations[${index}] must be an object`, {
        index,
      });
    }

    const named = OPERATIONS.filter((operation) => operation in entry);
    if (named.length !== 1) {
      throw new HttpError(
        400,
        'BAD_REQUEST',
        named.length === 0
          ? `mutations[${index}] must name one of ${OPERATIONS.join(', ')}`
          : `mutations[${index}] names ${named.join(' and ')} — exactly one operation per mutation`,
        { index, found: named },
      );
    }

    return entry as DocumentMutation;
  });
}

export const handler = withHandler(main);
