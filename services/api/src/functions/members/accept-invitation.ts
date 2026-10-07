/**
 * `POST /v1/projects/{p}/invitation` — accept the offer addressed to the caller.
 *
 * The invitation is looked up by `viewer.email`, and that is the whole of the
 * proof it needs: the offer was addressed to an address, a membership row is
 * keyed by that address until it is accepted, and a caller who is signed in as
 * that address is holding it. `acceptInvitation` re-keys the row to the caller's
 * id in one transaction, which is what turns the offer into a membership.
 *
 * A token principal cannot accept one: it has no address, so there is no offer it
 * could be holding, and its reach is already fixed by the scopes it was issued
 * with rather than by anything it could be invited to.
 */

import type { Member } from '@achar/types';
import { isTokenViewer, requireViewer } from '../../lib/auth';
import { HttpError, pathParam, withHandler } from '../../lib/http';
import { acceptInvitation, toApiMember } from '../../lib/members';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  if (isTokenViewer(viewer)) {
    throw new HttpError(403, 'FORBIDDEN', 'An API token cannot accept an invitation');
  }

  const accepted = await acceptInvitation({
    projectId,
    userId: viewer.userId,
    // The address the claims carry is what the row was keyed by, so it is both
    // the key to look the offer up under and the address the membership records.
    email: viewer.email,
    name: viewer.name,
    invitedEmail: viewer.email,
  });

  const member: Member = toApiMember(accepted, viewer.userId);
  return member;
});
