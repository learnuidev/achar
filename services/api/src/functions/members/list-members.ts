/**
 * `GET /v1/projects/{p}/members` — the roster, invitations included.
 *
 * Members and unaccepted invitations are one list here because they are one list
 * to whoever reads it: an admin asking who has been offered a place wants the
 * offer they made, and `status` is what tells the two apart.
 *
 * `isYou` is resolved against the caller so a screen can mark their own row
 * without comparing ids of its own — including the caller's membership of a
 * project reached with a token, which is the row of whoever issued it.
 */

import type { ListResponse, Member } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { listMembers, toApiMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'read');

  const rows = await listMembers(projectId);
  // A roster is read whole: it is bounded by how many people share a project,
  // and a page of it would be a screen that cannot answer what it is for.
  const members: ListResponse<Member> = {
    items: rows.map((row) => toApiMember(row, viewer.userId)),
    nextToken: null,
  };

  return members;
});
