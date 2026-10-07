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
import { languagesOf, sameLanguage } from '../../lib/languages';
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
import { assertValidDocument, coerceDocumentFields, documentType, getDatasetSchema } from '../../lib/schemas';
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
  'restore',
] as const;

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const mutations = assertMutations(listField(body, 'mutations') ?? []);
  const atomic = booleanField(body, 'atomic') ?? false;

  // The languages a mutation may write in, checked once for the batch: a language
  // this dataset does not have is a 400 naming the ones it does, rather than a
  // value stored under a key no read will ever look up.
  const datasetLanguages = languagesOf(access.dataset);
  for (const mutation of mutations) assertKnownLanguages(mutation, datasetLanguages);

  // Read once for the whole batch rather than per mutation: the schema is what
  // decides whether a document is a document, and a batch that fetched it three
  // times would be three reads of a row that cannot change underneath it.
  const schema = await getDatasetSchema(projectId, dataset);
  const validate = (document: AcharDocument, stage: 'draft' | 'published'): void =>
    assertValidDocument(schema, document, {
      requireComplete: stage === 'published',
      defaultLanguage: datasetLanguages.defaultLanguage,
    });

  const applied = await applyMutations({
    projectId,
    dataset,
    mutations,
    atomic,
    validate,
    // So that a caller holding a string can write a rich-text field: the plainest
    // thing anybody can send is text, and assembling `{"_type":"block","children":[…]}}`
    // around one sentence is asking every client to be an editor. See
    // `coerceDocument`, and its exemption for patches.
    coerce: (fields) => coerceDocumentFields(schema, fields),
    // What tells a write which fields hold one value per language, and which
    // language a plain value with no `_language` of its own belongs to.
    typeOf: (name) => documentType(schema, name),
    defaultLanguage: datasetLanguages.defaultLanguage,
    // Recorded on the version a publish leaves behind, so a history says who
    // published what rather than only when.
    publishedBy: viewer.userId,
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
 * Refuses a mutation that names a language this dataset does not have.
 *
 * The check is here rather than in the store because it is about the dataset, and
 * the store is about documents: by the time a value reached `applyDocuments` the
 * only thing left to do with a bad code would be to store it under a key nothing
 * reads. `publish`, `unpublish`, `delete` and `restore` name no language — they act
 * on a row, and a row is every language at once.
 */
function assertKnownLanguages(
  mutation: DocumentMutation,
  languages: { languages: string[]; defaultLanguage: string },
): void {
  const bodies = [
    mutation.create,
    mutation.createOrReplace,
    mutation.createIfNotExists,
    mutation.patch,
  ];

  for (const body of bodies) {
    const code = body?._language?.trim();
    if (!code) continue;
    if (languages.languages.some((known) => sameLanguage(known, code))) continue;

    throw new HttpError(400, 'UNKNOWN_LANGUAGE', `This dataset is not authored in ${code}`, {
      language: code,
      languages: languages.languages,
      defaultLanguage: languages.defaultLanguage,
    });
  }
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
