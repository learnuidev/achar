import type { AcharDocument, DatasetExport } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { listAssets, toAsset } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import { listAllRows, toApiDocument } from '../../lib/documents';
import { pathParam, withHandler } from '../../lib/http';
import { getDatasetSchema } from '../../lib/schemas';

/**
 * The whole dataset, as one portable file.
 *
 * This is the one read in this API that is allowed to take a dataset entire,
 * and it is the point of the route: a copy that arrived in pages would be a
 * copy that is sometimes the dataset, and a portable file that is sometimes
 * right is not portable. Drafts travel with it — the export is of the content,
 * not of what happens to be published — and every entry says which of the two
 * rows it came from.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const [schema, rows, assets] = await Promise.all([
    getDatasetSchema(projectId, dataset),
    listAllRows(projectId, dataset),
    listAssets(projectId, dataset),
  ]);

  // Both rows of a document are in this read, so which documents have a
  // published version is answered by the page itself rather than by a read per
  // row — and a draft whose published row came back as well is marked as both.
  const published = new Set(rows.filter((row) => !row.draft).map((row) => row._id));

  // By `_id`, then published before its draft, so two exports of an unchanged
  // dataset produce byte-identical files and a diff between them is a change to
  // the content rather than to the order the table happened to return.
  const documents: AcharDocument[] = [...rows]
    .sort((a, b) => (a._id === b._id ? Number(a.draft) - Number(b.draft) : a._id < b._id ? -1 : 1))
    .map((row) =>
      toApiDocument(row, { draft: row.draft, published: published.has(row._id), editable: false }),
    );

  const exported: DatasetExport = {
    projectId,
    dataset,
    exportedAt: new Date().toISOString(),
    revision: schema.revision,
    types: schema.types,
    documents,
    assets: assets.map(toAsset),
  };

  return exported;
});
