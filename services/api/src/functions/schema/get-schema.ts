import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { getDatasetSchema } from '../../lib/schemas';

/**
 * The schema a dataset is authored against.
 *
 * A brand new dataset has one: a dataset that has never had a schema stored is
 * not a dataset without a schema, and `getDatasetSchema` answers Achar's own
 * content model for it. That default is what lets a studio open on a dataset
 * nobody has configured yet and draw a form rather than an empty screen.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'read');

  return getDatasetSchema(projectId, dataset);
});
