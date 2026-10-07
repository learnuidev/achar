/**
 * `PATCH /v1/projects/{p}/members/{userId}` — change a member's role.
 *
 * The `userId` segment addresses a membership row, so it is the address of
 * somebody who has not accepted an invitation yet and their id once they have —
 * `updateMemberRole` looks the row up by whichever it is.
 *
 * The owner's own row is refused. A project whose owner is no longer an admin
 * cannot be administered: every remaining route that manages members is an admin
 * route, so the demotion could not be undone through this API by anybody.
 */

import type { Member } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { HttpError, jsonBody, pathParam, requiredStringField, withHandler } from '../../lib/http';
import { requireProjectRole, toApiMember, updateMemberRole } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const userId = pathParam(event, 'userId');

  const access = await requireProjectAccess(projectId, viewer, 'admin');
  if (userId === access.project.ownerId) {
    throw new HttpError(403, 'FORBIDDEN', 'The owner of a project cannot change role');
  }

  const body = jsonBody(event);
  const role = requireProjectRole(requiredStringField(body, 'role'));

  const updated = await updateMemberRole(projectId, userId, role);

  const member: Member = toApiMember(updated, viewer.userId);
  return member;
});
