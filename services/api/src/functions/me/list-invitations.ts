/**
 * `GET /v1/me/invitations` — the offers addressed to the caller's own address.
 *
 * An invitation is addressed by an address and by nothing else, so this route
 * answers from the claims. A token principal presents no address — its `email` is
 * empty by construction — so it has nothing for an invitation to have been
 * addressed to, and an empty list is the honest answer rather than every
 * invitation belonging to the project the token reaches.
 *
 * The project's name is read per invitation because that is where the name
 * lives: the row is the offer, and the screen that lists offers is showing a
 * project the caller cannot otherwise see.
 */

import type { Invitation, ListResponse } from '@achar/types';
import { isTokenViewer, requireViewer } from '../../lib/auth';
import { withHandler } from '../../lib/http';
import { listInvitationsForEmail } from '../../lib/members';
import { getProject } from '../../lib/projects';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);

  if (isTokenViewer(viewer)) {
    const none: ListResponse<Invitation> = { items: [], nextToken: null };
    return none;
  }

  const rows = await listInvitationsForEmail(viewer.email);
  const items: Invitation[] = [];

  for (const row of rows) {
    const project = await getProject(row.projectId);
    // A row naming a project that is gone is a cascade that has not finished;
    // skipping it is what keeps one stale row from failing the whole list.
    if (!project) continue;

    items.push({
      projectId: row.projectId,
      projectName: project.name,
      role: row.role,
      // The address the offer was addressed to, which is the caller's own.
      email: row.email,
      invitedBy: row.invitedBy ?? null,
      invitedAt: row.invitedAt,
    });
  }

  // The whole set comes back from one query, so there is no next page to name.
  const invitations: ListResponse<Invitation> = { items, nextToken: null };
  return invitations;
});
