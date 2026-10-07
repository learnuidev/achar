import type {
  AcharDocument,
  DocumentSummary,
  ListResponse,
  MutationRequest,
  MutationResponse,
  Perspective,
  QueryRequest,
  QueryResult,
} from '@achar/types';

import { queryString, segment, type ApiContext } from '../../lib/context';

/** Which documents of one type a studio's list asks for. */
export interface ListDocumentsOptions {
  type: string;
  limit?: number;
  nextToken?: string;
  perspective?: Perspective;
}

export interface GetDocumentOptions {
  perspective?: Perspective;
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
  });
  return api.get<ListResponse<DocumentSummary>>(
    `/v1/data/list/${projectId}/${dataset}${search}`,
  );
}

/** One document, at one perspective. */
export function getDocument(
  api: ApiContext,
  projectId: string,
  dataset: string,
  documentId: string,
  options: GetDocumentOptions = {},
): Promise<AcharDocument> {
  const search = queryString({ perspective: options.perspective });
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
