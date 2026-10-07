/**
 * `DELETE /v1/projects/{p}` — the project, and everything under it.
 *
 * The owner and only the owner: an admin cannot delete somebody else's project,
 * and a token can never hold ownership. See `requireProjectOwner`.
 *
 * The route answers 204 rather than the cascade's counts, because a client that
 * has just deleted a project has nothing to do with them.
 */

import { requireProjectOwner } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { noContent, pathParam, withHandler } from '../../lib/http';
import { deleteProject } from '../../lib/projects';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectOwner(projectId, viewer);

  const counts = await deleteProject(projectId);
  // Logged because what was removed is the only record of a delete that exists
  // once the rows are gone, and CloudWatch is where it survives.
  console.log('Deleted project', projectId, counts);

  return noContent();
});
