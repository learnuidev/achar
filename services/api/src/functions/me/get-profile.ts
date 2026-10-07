/**
 * `GET /v1/me` — the caller, and what they have.
 *
 * A person and a token are answered from different places, because only one of
 * them is a person: a person has a profile row and belongs to projects, whereas
 * a token is a credential whose counts are fixed facts about it — one project,
 * and no address for an invitation to be addressed to.
 *
 * A person's profile row is written on first sight. An absent row is somebody
 * who has never called this route rather than an error, and `createdAt` is worth
 * keeping: it is the only record of when this API first saw them.
 */

import type { Profile } from '@achar/types';
import { requireViewer, isTokenViewer, type ApiViewer } from '../../lib/auth';
import { Keys, getItem, putIfAbsent, type Item } from '../../lib/dynamo';
import { HttpError, withHandler } from '../../lib/http';
import { countProjectsForUser, listInvitationsForEmail } from '../../lib/members';
import { getToken } from '../../lib/tokens';

/** A row of `ProfilesTable`. Nothing but this route reads one. */
interface ProfileRow extends Item {
  userId: string;
  email: string;
  name?: string | null;
  createdAt: string;
}

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);

  if (isTokenViewer(viewer)) {
    // The token's own row is the credential, and a revoked one no longer has a
    // row to read: a bearer that resolved a moment ago and is gone now is not a
    // caller this route can describe.
    const token = await getToken(viewer.token.projectId, viewer.token.tokenId);
    if (!token) throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized');

    const asToken: Profile = {
      userId: viewer.token.tokenId,
      // A token has no address of its own — the caller's identity is the
      // credential, which is what `userId` above names.
      email: '',
      name: token.name,
      createdAt: token.createdAt,
      // A token reaches the one project it was issued for, and nobody invites a
      // credential anywhere.
      projectCount: 1,
      invitationCount: 0,
    };
    return asToken;
  }

  const row = await profileFor(viewer);
  const profile: Profile = {
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    createdAt: row.createdAt,
    projectCount: await countProjectsForUser(viewer.userId),
    invitationCount: (await listInvitationsForEmail(viewer.email)).length,
  };

  return profile;
});

/**
 * The caller's profile row, writing it when this is the first time they are seen.
 *
 * `putIfAbsent` rather than a plain write so that two first calls arriving
 * together cannot overwrite one another's `createdAt` — the only field either of
 * them contributes, and the one the loser would then have invented. Whoever
 * loses reads the row that won.
 */
async function profileFor(viewer: ApiViewer): Promise<ProfileRow> {
  const key = Keys.profile(viewer.userId);
  const existing = await getItem<ProfileRow>('ProfilesTable', key);
  if (existing) return existing;

  const row: ProfileRow = {
    userId: viewer.userId,
    email: viewer.email,
    name: viewer.name ?? null,
    createdAt: new Date().toISOString(),
  };

  if (await putIfAbsent('ProfilesTable', row, 'userId')) return row;
  return (await getItem<ProfileRow>('ProfilesTable', key)) ?? row;
}
