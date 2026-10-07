/**
 * `DELETE /v1/projects/{p}/members/{userId}` — remove a member, or revoke an
 * invitation that was never accepted.
 *
 * One route for both because they are one row and one intent: taking the row away
 * is what stops the person reaching the project, whether or not they ever did.
 * The identifier is the address while the offer stands and the caller's id once
 * it has been accepted.
 *
 * The owner is refused. Removing the owner's own row would leave a project that
 * nobody owns, and `requireProjectOwner` is the only way to delete one — so the
 * project would be undeletable through this API by anybody, including the person
 * who removed themselves.
 */

import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { HttpError, noContent, pathParam, withHandler } from '../../lib/http';
import { removeMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const userId = pathParam(event, 'userId');

  const access = await requireProjectAccess(projectId, viewer, 'admin');
  if (userId === access.project.ownerId) {
    throw new HttpError(403, 'FORBIDDEN', 'The owner of a project cannot be removed');
  }

  await removeMember(projectId, userId);

  return noContent();
});
