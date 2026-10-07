import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { deleteDataset } from '../../lib/datasets';
import { noContent, pathParam, withHandler } from '../../lib/http';

/**
 * Deletes a dataset and everything in it.
 *
 * Documents, then the stored schema, then the assets and their objects, then the
 * row — `deleteDataset` owns that order, and this route owns telling somebody
 * what it removed.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'admin');

  const counts = await deleteDataset(projectId, dataset);

  // The log line is the only record of the cascade: every row it counted is
  // gone and nothing else wrote the number down, so a delete that took more
  // than it should have is visible here and nowhere else.
  console.log('Deleted dataset', { projectId, dataset, ...counts });

  return noContent();
});
