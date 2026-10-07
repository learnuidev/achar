import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { toDataset } from '../../lib/datasets';
import { pathParam, withHandler } from '../../lib/http';

/** One dataset of a project. */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  // The access check already read the row — it has to, to answer its 404 — so
  // this route is one read rather than a read and a re-read.
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'read');

  return toDataset(access.dataset);
});
