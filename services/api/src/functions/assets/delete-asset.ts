/**
 * `DELETE /v1/assets/{p}/{d}/{assetId}` — the object and the row.
 *
 * The order and the counting are `deleteAsset`'s, and they are the reason this
 * handler is four lines: the object goes first so that a failure in the middle
 * leaves a row whose bytes are gone — visible in the library, and fixable by
 * asking again — rather than bytes nobody can name and nobody can reach. The
 * dataset's counter moves only for a row that was committed.
 *
 * Nothing comes back. The caller asked for a thing to stop existing, and a
 * description of the thing that no longer exists is not an answer to that.
 */

import { requireDatasetAccess } from '../../lib/access';
import { deleteAsset } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import { noContent, pathParam, withHandler, type ApiEvent } from '../../lib/http';

export const handler = withHandler(async (event: ApiEvent) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const assetId = pathParam(event, 'assetId');
  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  await deleteAsset(projectId, dataset, assetId);
  return noContent();
});
