/**
 * `GET /v1/projects/{p}` — one project, with the caller's role on it.
 *
 * `read` is the whole requirement: every member may see the project they are in,
 * and the role that comes back with it is what a client draws its controls from.
 * A project the caller is not in answers 403 rather than 404 — see `access.ts`
 * for why this API never says which project ids exist.
 */

import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { toProject } from '../../lib/projects';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  const access = await requireProjectAccess(projectId, viewer, 'read');

  return toProject(access.project, access.role);
});
