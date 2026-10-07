/**
 * `DELETE /v1/projects/{p}/members/{userId}` — remove a member, or revoke an
 * invitation that was never accepted.
 *
 * One route for both because they are one row and one intent: taking the row away
 * is what stops the person reaching the project, whether or not they ever did.
 * The identifier is the address while the offer stands and the caller's id once
 * it has been accepted.
 *
 * The owner is refused, and it is no longer about who may delete the project —
 * every admin of it may. It is about what removal costs the person: a membership
 * row is keyed by the `sub` once it is accepted, so there is no address to invite
 * back to, and re-entering the project would mean being invited afresh and
 * accepting again. Removing the person who made a project from its roster is
 * therefore not undoable here, and nothing asks for it.
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
