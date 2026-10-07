/**
 * `GET /v1/data/list/{p}/{d}` — a page of documents, built for a list screen.
 *
 * Deliberately not a GROQ query. A list needs four things a query would have to
 * re-derive per keystroke: the preview title and subtitle resolved through the
 * schema, whether a draft exists beside the published row, the media behind the
 * type's `preview.media` field as a URL, and a page token. This route answers
 * all four from one index read and a handful of lookups, which is what makes the
 * studio's list cheap and a `query` the right tool for everything else.
 *
 * Two of its parameters are honest about their limits rather than silently
 * wrong. `search` matches the preview title **within the page**, and `order` by
 * any field other than `_updatedAt` sorts **within the page** — the index that
 * would order the dataset by `publishedAt` does not exist, and adding one is a
 * decision about which field a dataset sorts by, not a filter somebody can slip
 * into a handler. Both are documented here rather than in a comment a caller
 * never reads; the honest alternative for either is a `query`.
 */

import { previewOf } from '@achar/schema';
import type { DocumentSummary } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { assetIdFromReference, assetUrlsForReferences } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import {
  editableFor,
  pageRows,
  readLanguages,
  requirePerspective,
  resolvePageRows,
  toApiDocument,
  toSummary,
} from '../../lib/documents';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  HttpError,
  decodeNextToken,
  encodeNextToken,
  json,
  parseLimit,
  pathParam,
  queryParam,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import { getDatasetSchema, documentType } from '../../lib/schemas';

interface Ordering {
  field: string;
  direction: 'asc' | 'desc';
}

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const type = queryParam(event, 'type');
  if (!type) {
    throw new HttpError(400, 'BAD_REQUEST', 'type is required', { field: 'type' });
  }

  const perspective = requirePerspective(queryParam(event, 'perspective'), 'published');
  const editable = editableFor(access.role);
  const limit = parseLimit(queryParam(event, 'limit'), DEFAULT_LIMIT);
  const ordering = parseOrder(queryParam(event, 'order'));
  const search = queryParam(event, 'search')?.toLowerCase();

  const exclusiveStartKey = decodeNextToken(queryParam(event, 'nextToken'));
  const page = await pageRows({
    projectId,
    dataset,
    type,
    limit: Math.min(limit, MAX_LIMIT),
    // `_updatedAt` is the index's range key, so it is the one ordering this
    // route can honour across pages rather than only within a page.
    ascending: ordering.field === '_updatedAt' && ordering.direction === 'asc',
    ...(exclusiveStartKey ? { exclusiveStartKey } : {}),
  });

  const resolved = await resolvePageRows(projectId, dataset, page.rows, perspective);

  const schema = await getDatasetSchema(projectId, dataset);
  const schemaType = documentType(schema, type);
  const previewField = schemaType?.preview?.media;

  /**
   * Every row as a document in the language this list is being read in.
   *
   * Before anything previews it, because a preview reads *fields* and a localized
   * field holds a map until a language is applied — the alternative is a list of
   * titles that render as `[object Object]`. The media reference is read from the
   * answered document for the same reason.
   */
  const read = readLanguages(schema, access.dataset, queryParam(event, 'language'));
  const entries = resolved.map((entry) => ({
    entry,
    document: toApiDocument(
      entry.row,
      { draft: entry.draft, published: entry.published, editable },
      read,
    ),
  }));

  // The media is a reference in the document and a URL in the answer, so the
  // page's references are resolved in one pass before any summary is shaped:
  // twenty posts illustrated with six images should cost six reads, not twenty.
  const references = entries
    .map(({ document }) => (previewField ? readPath(document, previewField) : undefined))
    .map(assetIdFromReference)
    .filter((id): id is string => Boolean(id));
  const urls = await assetUrlsForReferences(projectId, dataset, references);

  let summaries: DocumentSummary[] = entries.map(({ entry, document }) =>
    toSummary(
      document,
      { hasDraft: entry.hasDraft, published: entry.published, language: read.language },
      (answered) => {
        const shaped = schemaType
          ? previewOf(schemaType, answered)
          : { title: entry.id, subtitle: undefined, mediaField: undefined };
        const mediaReference = shaped.mediaField ? readPath(answered, shaped.mediaField) : undefined;
        const assetId = assetIdFromReference(mediaReference);

        return {
          title: shaped.title,
          subtitle: shaped.subtitle ?? null,
          mediaUrl: (assetId ? urls.get(assetId) : undefined) ?? null,
        };
      },
    ),
  );

  if (search) {
    // Over the preview title, because that is the string the list draws and the
    // one a person is searching for. A schema could index a `searchable` field
    // and this would be the place to read it.
    summaries = summaries.filter((summary) => summary.title.toLowerCase().includes(search));
  }

  if (ordering.field !== '_updatedAt') {
    summaries = sortInPage(summaries, ordering);
  }

  return json({ items: summaries, nextToken: encodeNextToken(page.lastEvaluatedKey) });
}

function parseOrder(raw: string | undefined): Ordering {
  if (!raw) return { field: '_updatedAt', direction: 'desc' };
  const [field, direction] = raw.split(':');
  if (!field) throw new HttpError(400, 'BAD_REQUEST', 'order must be `field:asc` or `field:desc`', {
    field: 'order',
  });
  return {
    field,
    direction: direction === 'asc' ? 'asc' : 'desc',
  };
}

function sortInPage(summaries: DocumentSummary[], ordering: Ordering): DocumentSummary[] {
  const sign = ordering.direction === 'asc' ? 1 : -1;
  return [...summaries].sort((a, b) => sign * compare(readPath(a, ordering.field), readPath(b, ordering.field)));
}

function compare(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left) < String(right) ? -1 : 1;
}

/** A dotted path over a document, since a preview field may be nested. */
function readPath(source: unknown, path: string): unknown {
  let cursor: unknown = source;
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

export const handler = withHandler(main);
