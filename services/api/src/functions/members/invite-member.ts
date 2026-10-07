/**
 * `POST /v1/projects/{p}/members` — invite an address with a role.
 *
 * **No email is sent.** This service has no mail transport, and an invitation
 * here is a row addressed to an address: it becomes a membership when whoever
 * can sign in as that address accepts it. Delivering the offer is the caller's
 * business — this route answers with the row it wrote, which is the offer itself.
 *
 * The inviter's own address is refused: an admin inviting themselves writes a row
 * that duplicates the membership they already have, keyed by the address instead
 * of their id, and it would be theirs to accept from themselves.
 */

import type { Member } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  HttpError,
  created,
  jsonBody,
  pathParam,
  requiredStringField,
  withHandler,
} from '../../lib/http';
import { inviteMember, normalizeEmail, requireProjectRole, toApiMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const body = jsonBody(event);
  const role = requireProjectRole(requiredStringField(body, 'role'));

  // Normalized before it is compared or written: an address is one address
  // whatever case it was typed in, and the row is keyed by it.
  const email = normalizeEmail(requiredStringField(body, 'email'));
  if (viewer.email && normalizeEmail(viewer.email) === email) {
    throw new HttpError(400, 'BAD_REQUEST', 'You cannot invite your own address', { field: 'email' });
  }

  // An address that already has a row answers 409 from here — whether it is an
  // accepted membership or an invitation nobody has taken up.
  const row = await inviteMember({ projectId, email, role, invitedBy: viewer.userId });

  const member: Member = toApiMember(row, viewer.userId);
  return created(member);
});
