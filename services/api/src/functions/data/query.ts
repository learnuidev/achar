/**
 * `GET /v1/data/query/{p}/{d}` — GROQ over one dataset.
 *
 * The route's whole job is to decide which documents a query is allowed to
 * consider, and to do it through an index. `TypeIndex` when the filter pins a
 * `_type` and `UpdatedIndex` otherwise, capped by the caller's `limit`: a query
 * language that could reach the whole table would make every route that uses it
 * a scan nobody can see in the source.
 *
 * The candidate rows are resolved to documents *before* evaluation, so what a
 * query sees is what a client would have read — an id with `drafts.` on it, the
 * internal key attributes, and a document that the perspective excludes are all
 * absent. A filter over rows that still carried `documentKey` would be a query
 * language with a private vocabulary.
 */

import type { Perspective } from '@achar/types';
import { parse, evaluate, typeHintOf } from '../../lib/groq';
import { requireDatasetAccess } from '../../lib/access';
import { withAssetUrls } from '../../lib/assets';
import { shapeForDelivery } from '../../lib/documents';
import { getDatasetSchema, requireDocumentShape, type DocumentShape } from '../../lib/schemas';
import { requireViewer } from '../../lib/auth';
import {
  editableFor,
  getDocument,
  pageRows,
  requirePerspective,
  resolvePage,
} from '../../lib/documents';
import { HttpError, json, pathParam, queryParam, withHandler, type ApiEvent } from '../../lib/http';

/** Documents one answer may carry unless the caller says otherwise. */
const DEFAULT_LIMIT = 100;

/** The ceiling, which is about what one Lambda can resolve rather than about taste. */
const MAX_LIMIT = 500;

/**
 * Rows are read in twos for one document, so a cap of `limit` documents is read
 * as twice that many rows — otherwise a query of twenty posts would answer with
 * ten. The absolute ceiling stops a caller from turning `limit` into a table
 * read by asking for five hundred documents of a dataset that is mostly drafts.
 */
const ROW_CEILING = 1000;

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const text = queryParam(event, 'query');
  if (!text) throw new HttpError(400, 'BAD_REQUEST', 'query is required', { field: 'query' });

  // A site is the caller that does not pass a perspective, and a site must never
  // be handed a draft: `published` is the default here rather than the `raw` the
  // studio asks for by name.
  const perspective = requirePerspective(queryParam(event, 'perspective'), 'published');
  const shape = requireDocumentShape(queryParam(event, 'shape'));
  const params = parseParams(queryParam(event, 'params'));
  const limit = Math.min(readLimit(queryParam(event, 'limit')), MAX_LIMIT);
  const editable = editableFor(access.role);

  const started = Date.now();
  const ast = parse(text);
  const type = typeHintOf(ast);

  const page = await pageRows({
    projectId,
    dataset,
    ...(type ? { type } : {}),
    limit: Math.min(limit * 2, ROW_CEILING),
  });

  const documents = await resolvePage(projectId, dataset, page.rows, perspective, editable);

  const result = await evaluate(
    ast,
    {
      params,
      documents,
      // A dereference names a document the fetched set may not hold — a page of
      // posts does not carry its authors — so it is resolved on demand, once per
      // id, at the perspective this query is being answered at.
      lookup: (id: string) => getDocument(projectId, dataset, id, perspective, editable),
    },
    { this: null },
  );

  return json({
    // Whatever the query projected, with the CDN address of every asset in it: a
    // projection is a value the client did not get to choose the shape of, so this
    // walks it rather than assuming documents.
    result: await shapeResult(projectId, dataset, perspective, result, shape),
    ms: Date.now() - started,
    perspective,
    documentsRead: page.rows.length,
  });
}

/**
 * The result, with every whole document in it shaped.
 *
 * A projection is a shape the client chose, and this walks the *value* rather than
 * assuming documents: anything that names a `_type` this dataset declares is shaped,
 * and everything else — a projection's own fields, a count, a slice — is left as the
 * query wrote it. That is the line between the two: a query that asked for
 * `{title, "author": author->name}` gets exactly that, and a query that asked for
 * the documents gets the documents as their types.
 *
 * `stored` skips all of it and resolves assets only, which is what the studio asks
 * for — the same answer the asset walk gave before any of this existed.
 */
async function shapeResult(
  projectId: string,
  dataset: string,
  perspective: Perspective,
  result: unknown,
  shape: DocumentShape,
): Promise<unknown> {
  if (shape === 'stored') return withAssetUrls(projectId, dataset, result);

  const schema = await getDatasetSchema(projectId, dataset);
  const walk = async (value: unknown): Promise<unknown> => {
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (typeof value !== 'object' || value === null) return value;

    const record = value as Record<string, unknown>;
    if (typeof record._type === 'string') {
      const shaped = await shapeForDelivery(projectId, dataset, schema, record, perspective);
      // A type this dataset does not declare: assets are still addresses.
      return shaped === record ? withAssetUrls(projectId, dataset, record) : shaped;
    }

    const next: Record<string, unknown> = {};
    for (const [name, entry] of Object.entries(record)) next[name] = await walk(entry);
    return next;
  };

  return walk(result);
}

/** `?params={"type":"post"}` — an object, or nothing, and never a silent `{}`. */
function parseParams(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'params must be a JSON object', { field: 'params' });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'BAD_REQUEST', 'params must be a JSON object', { field: 'params' });
  }
  return parsed as Record<string, unknown>;
}

function readLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT;
  return Math.floor(value);
}

export const handler = withHandler(main);
