/**
 * `POST /v1/projects/{p}/members/{userId}/invitation` — send an invitation again.
 *
 * There is no email to send, so re-sending is re-dating the offer: **the row is
 * the offer**, and what this route changes is when it was made and who made it.
 * A client that wants to put the invitation in front of somebody again reads the
 * `invitedAt` it gets back and delivers it itself.
 *
 * A row that has already been accepted answers 409 from `resendInvitation`: there
 * is no offer left to re-date, and rewriting the term of a membership somebody
 * holds is not what this route is for.
 */

import type { Member, ProjectRole } from '@achar/types';
import { PROJECT_ROLES } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { HttpError, jsonBody, pathParam, stringField, withHandler } from '../../lib/http';
import { resendInvitation, toApiMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const userId = pathParam(event, 'userId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const role = stringField(jsonBody(event), 'role');
  if (role !== undefined && !(PROJECT_ROLES as readonly string[]).includes(role)) {
    throw new HttpError(400, 'BAD_REQUEST', `role must be one of ${PROJECT_ROLES.join(', ')}`, {
      field: 'role',
    });
  }

  const row = await resendInvitation(
    projectId,
    userId,
    viewer.userId,
    role as ProjectRole | undefined,
  );

  const member: Member = toApiMember(row, viewer.userId);
  return member;
});
