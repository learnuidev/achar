import type {
  AcharDocument,
  DocumentSummary,
  DocumentVersion,
  DocumentVersionSummary,
  ListResponse,
  MutationRequest,
  MutationResponse,
  Perspective,
  QueryRequest,
  QueryResult,
} from '@achar/types';

import { queryString, segment, type ApiContext } from '../../lib/context';

/**
 * Which documents of one type a studio's list asks for.
 *
 * `search` and `order` are here because the route accepts them and a client that
 * silently drops a parameter is worse than one that never offered it: the caller
 * sees a full list and concludes the search matched everything.
 *
 * Both are applied **within the page** rather than by the database, which is worth
 * knowing when a result looks short. The index the list reads orders by
 * `_updatedAt`, so a different order, or a text match, can only be taken over the
 * rows the index already returned. Ordering a whole dataset by `publishedAt` would
 * need an index on it, and this dataset does not have one.
 */
export interface ListDocumentsOptions {
  type: string;
  limit?: number;
  nextToken?: string;
  perspective?: Perspective;
  /** A case-insensitive substring of the document's preview title. */
  search?: string;
  /** `field:asc` or `field:desc`. Any field except `_updatedAt` sorts in the page. */
  order?: string;
}

export type DocumentShape = 'schema' | 'stored';

export interface GetDocumentOptions {
  perspective?: Perspective;
  /**
   * How to shape the answer.
   *
   * `schema` — the default — is what a site renders: an `image` field is an address,
   * a reference is the document it names. `stored` is what an editor works with: an
   * image field is a reference it can replace and a reference is an id it can point
   * somewhere else. The studio asks for `stored` for the same reason it writes
   * references rather than the documents they name.
   */
  shape?: DocumentShape;
}

/**
 * One query, one answer, and the numbers that make it legible.
 *
 * `params` travels as JSON in the query string rather than as a `POST` body: the
 * route is a `GET` because a query is a read, and a read that caches is a read
 * that costs nothing on the second page view.
 */
export function query<T>(
  api: ApiContext,
  projectId: string,
  dataset: string,
  req: QueryRequest,
): Promise<QueryResult<T>> {
  const search = queryString({
    query: req.query,
    params: req.params ? JSON.stringify(req.params) : undefined,
    perspective: req.perspective,
    shape: req.shape,
    limit: req.limit,
  });
  return api.get<QueryResult<T>>(`/v1/data/query/${projectId}/${dataset}${search}`);
}

/** Documents of one type, paged, as a list needs them. */
export function listDocuments(
  api: ApiContext,
  projectId: string,
  dataset: string,
  options: ListDocumentsOptions,
): Promise<ListResponse<DocumentSummary>> {
  const search = queryString({
    type: options.type,
    limit: options.limit,
    nextToken: options.nextToken,
    perspective: options.perspective,
    search: options.search,
    order: options.order,
  });
  return api.get<ListResponse<DocumentSummary>>(
    `/v1/data/list/${projectId}/${dataset}${search}`,
  );
}

/**
 * One document, at one perspective.
 *
 * The perspective is accepted either bare or wrapped, because it is the one thing
 * a read of a document varies by: `getDocument(p, d, id, 'raw')` is what almost
 * every caller writes, and the object form is there for the options that will
 * accumulate around it rather than being a tax on every call today.
 */
export function getDocument(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
  perspective?: Perspective | GetDocumentOptions,
): Promise<AcharDocument> {
  const options = typeof perspective === 'string' ? { perspective } : perspective;
  const search = queryString({ perspective: options?.perspective, shape: options?.shape });
  return api.get<AcharDocument>(
    `/v1/data/doc/${projectId}/${dataset}/${segment(documentId)}${search}`,
  );
}

/**
 * An ordered batch of mutations.
 *
 * One route for every write there is, because a mutation is a script rather than
 * a shape: publishing a document, unsetting two fields on another and creating a
 * third is one request that either happens or does not, instead of three that can
 * half-happen.
 */
export function mutate(
  api: ApiContext,
  projectId: string,
  dataset: string,
  req: MutationRequest,
): Promise<MutationResponse> {
  return api.post<MutationResponse>(`/v1/data/mutate/${projectId}/${dataset}`, req);
}

/**
 * Publishing, unpublishing and discarding a draft are one mutation each.
 *
 * They are methods rather than something callers assemble themselves because
 * these three are the operations the product is *about* — the draft/publish pair
 * is the whole reason there are two rows — and every caller writing the mutation
 * by hand is a caller who can write a different one.
 */
export function publishDocument(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<MutationResponse> {
  return mutate(api, projectId, dataset, { mutations: [{ publish: { id: documentId } }] });
}

/** Takes the published row away, leaving the draft where it goes back to. */
export function unpublishDocument(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<MutationResponse> {
  return mutate(api, projectId, dataset, { mutations: [{ unpublish: { id: documentId } }] });
}

/**
 * Every version of a document, newest first.
 *
 * A version is written when a document is published, so this is the list of
 * publishes — `v1` is the first one and the number goes up by one each time. The
 * entries are summaries; `getDocumentVersion` is the one that carries the content.
 */
export function listDocumentVersions(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  return api.get<DocumentVersionSummary[]>(
    `/v1/data/doc/${projectId}/${dataset}/${segment(documentId)}/versions`,
  );
}

/** One version with the document it holds — what it said at the moment it was published. */
export function getDocumentVersion(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
  version: number,
): Promise<DocumentVersion> {
  return api.get<DocumentVersion>(
    `/v1/data/doc/${projectId}/${dataset}/${segment(documentId)}/versions/${version}`,
  );
}

/**
 * Puts a version back, as the draft.
 *
 * A mutation rather than a route of its own, because that is what it is: one write
 * to one document, on the same path as every other write, with the same validation
 * and the same conflict rule. And the draft rather than the published row —
 * restoring is a decision somebody reviews, and publishing is the step that
 * changes what a site serves.
 */
export function restoreDocumentVersion(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
  version: number,
): Promise<MutationResponse> {
  return mutate(api, projectId, dataset, {
    mutations: [{ restore: { id: documentId, version } }],
  });
}

/** Throws the draft away. The published row, if there is one, is untouched. */
export function discardDraft(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<MutationResponse> {
  const draftId = documentId.startsWith('drafts.') ? documentId : `drafts.${documentId}`;
  return mutate(api, projectId, dataset, { mutations: [{ delete: { id: draftId } }] });
}
