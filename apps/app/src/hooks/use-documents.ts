'use client';

import type { AcharDocument, DocumentSummary, ListResponse, Perspective } from '@achar/types';
import { asPage } from '@/lib/api-shapes';
import { errorStatus } from '@/lib/errors';
import { useResource, type Resource } from '@/hooks/use-resource';

/** How a list of documents is asked for: which type, and which page. */
export interface DocumentsQuery {
  type: string;
  limit?: number;
  nextToken?: string | null;
  /** Defaults to `previewDrafts`, because a studio shows what an editor is working on. */
  perspective?: Perspective;
}

/** A page of summaries, exactly as the list endpoint pages them. */
export type DocumentsPage = ListResponse<DocumentSummary>;

/**
 * A page of documents of one type.
 *
 * The list endpoint is the reason this is not a `query`: it is built for a
 * table — it resolves each row's preview title and media through the schema,
 * tells the list whether a draft exists beside the published row, and pages by
 * a token rather than an offset. A GROQ query would have to re-derive all of
 * that, in the studio, per keystroke.
 *
 * Its request carries a type, a limit, a page token and a perspective, and
 * nothing else: searching and sorting a list happen over the page in
 * `content/[type]`, which is where the API's own `search` and `order` parameters
 * operate too — both are page-scoped there, because the index that would sort a
 * whole dataset by `publishedAt` does not exist. The honest alternative past one
 * page is a `query`, which is what the list screen says when somebody asks for
 * more than a page of matches.
 */
export function useDocuments(
  projectId: string,
  dataset: string,
  query: DocumentsQuery,
): Resource<DocumentsPage> {
  const key = [
    'documents',
    projectId,
    dataset,
    query.type,
    String(query.limit ?? ''),
    query.nextToken ?? '',
    query.perspective ?? '',
  ].join(':');

  return useResource(key, async (client) => {
    const answer = await client.listDocuments(projectId, dataset, {
      type: query.type,
      ...(query.limit ? { limit: query.limit } : {}),
      ...(query.nextToken ? { nextToken: query.nextToken } : {}),
      ...(query.perspective ? { perspective: query.perspective } : {}),
    });
    return asPage<DocumentSummary>(answer);
  });
}

/**
 * One document, at one perspective.
 *
 * The perspective is not a detail: `raw` answers the published row and
 * `previewDrafts` answers the draft, and the editor reads both — the second is
 * what it edits, the first is what it compares against.
 */
export function useDocument(
  projectId: string,
  dataset: string,
  documentId: string,
  perspective: Perspective,
): Resource<AcharDocument> {
  return useResource(`document:${projectId}/${dataset}/${documentId}:${perspective}`, (client) =>
    // `shape: 'stored'` in the one place it matters: the studio edits a *document* —
    // an image field is a reference it can replace and an author is an id it can
    // point somewhere else — where a site reads a *type*, whose fields are addresses
    // and documents. See `shapeForDelivery`.
    client.getDocument(projectId, dataset, documentId, { perspective, shape: 'stored' }),
  );
}

/** The list of results a page of documents and its token make. */
export function emptyPage(): ListResponse<DocumentSummary> {
  return { items: [], nextToken: null };
}

/**
 * Both rows of a document, which is what an editor needs to draw the pair.
 *
 * A document is two rows — the draft whose id begins `drafts.`, and the
 * published one — and the editor asks three questions of them at once: what am I
 * editing (the draft, or the published row when there is no draft), is there a
 * published version at all, and has the draft moved on since it was published.
 * One read cannot answer all three, so this is two, in parallel. A 404 on either
 * is a fact rather than a failure: a document that has never been published has
 * no published row.
 */
export interface DocumentPair {
  /** What the form shows: the draft when one exists, the published row otherwise. */
  shown: AcharDocument | null;
  /** The published row, when a published version exists. */
  published: AcharDocument | null;
  /** Whether the row being shown is the `drafts.` copy. */
  hasDraft: boolean;
}

export function useDocumentPair(
  projectId: string,
  dataset: string,
  documentId: string,
  options: { skip?: boolean } = {},
): Resource<DocumentPair> {
  const skip = options.skip === true;

  return useResource(
    `document-pair:${projectId}/${dataset}/${documentId}:${skip ? 'new' : 'read'}`,
    async (client) => {
      if (skip) return { shown: null, published: null, hasDraft: false };

      const [shown, raw] = await Promise.all([
        readOr404(
          client.getDocument(projectId, dataset, documentId, {
            perspective: 'previewDrafts',
            shape: 'stored',
          }),
        ),
        readOr404(
          client.getDocument(projectId, dataset, documentId, { perspective: 'raw', shape: 'stored' }),
        ),
      ]);

      return {
        shown,
        // `raw` answers the draft row for a document that has only a draft,
        // which is not a published version — and the row says so itself.
        published: raw && raw._draft !== true ? raw : null,
        hasDraft: shown?._draft === true,
      };
    },
  );
}

/**
 * A read whose "there is no such document" is an answer.
 *
 * Only a 404 is swallowed. Everything else — a 403, a network failure, a 500 —
 * is the API saying something is wrong, and turning that into "the document does
 * not exist" would leave somebody typing into a draft that will never save.
 */
async function readOr404(promise: Promise<AcharDocument>): Promise<AcharDocument | null> {
  try {
    return await promise;
  } catch (cause) {
    if (errorStatus(cause) === 404) return null;
    throw cause;
  }
}
