import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { getDatasetSchema } from '../../lib/schemas';

/**
 * The schema a dataset is authored against.
 *
 * A dataset that has never had a schema stored answers with **no content types**,
 * not with Achar's own model: what a dataset holds is the dataset's own decision,
 * and a project a minute old holding somebody else's content model is a studio full
 * of forms for fields nobody asked for. An empty schema is a real answer here, and
 * the studio draws it as the invitation to write the first type — the route that
 * does that is `create-type`.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'read');

  return getDatasetSchema(projectId, dataset);
});
