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

import type { Member } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { jsonBody, pathParam, stringField, withHandler } from '../../lib/http';
import { requireProjectRole, resendInvitation, toApiMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const userId = pathParam(event, 'userId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const asked = stringField(jsonBody(event), 'role');

  // Passing the role through rather than to a second route: re-inviting is also
  // how an admin offers somebody a different place.
  const row = await resendInvitation(
    projectId,
    userId,
    viewer.userId,
    asked === undefined ? undefined : requireProjectRole(asked),
  );

  const member: Member = toApiMember(row, viewer.userId);
  return member;
});
