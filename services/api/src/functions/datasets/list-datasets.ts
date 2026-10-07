import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { listDatasets, toDataset } from '../../lib/datasets';
import { pathParam, withHandler } from '../../lib/http';

/**
 * A project's datasets.
 *
 * Answered whole rather than paged: a project holds a handful of them, every
 * screen that asks for this list draws all of it, and a page boundary in the
 * middle of a sidebar is a sidebar that has to fetch again to be complete. So
 * `nextToken` is always null — the shape of `ListResponse` is kept, the paging
 * is not.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'read');

  const datasets = await listDatasets(projectId);
  return { items: datasets.map(toDataset), nextToken: null };
});
