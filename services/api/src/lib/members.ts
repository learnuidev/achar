/**
 * Memberships, and the offers that become them.
 *
 * A membership row is keyed by the person's *identity*, and which identity that
 * is changes once: before an invitation is accepted the only thing anybody
 * knows about the person is the address it was sent to, so the range key is the
 * address; accepting re-keys the row to the Cognito `sub`. That is why the row
 * carries `invitedEmail` separately from `email` — they are the before and after
 * of the one state change this file is about — and why the range key is called
 * `memberKey` rather than `userId`: naming it after one of the two things it
 * holds would make the other look like a bug.
 *
 * Nothing here authorizes anything. `access.ts` does that, and this file is
 * deliberately free of it so that a counter update cannot become a permission
 * check by accident.
 */

import type { Member, MemberStatus, ProjectRole } from '@achar/types';
import {
  Keys,
  countQuery,
  deleteAction,
  deleteItem,
  getItem,
  putAction,
  putIfAbsent,
  queryAll,
  transactWrite,
  tryUpdateItem,
  updateItem,
  type Item,
} from './dynamo';
import { HttpError } from './http';

export interface MemberRow extends Item {
  projectId: string;
  /** The range key: the address while invited, the `sub` once accepted. */
  memberKey: string;
  /** The person's id once accepted; the invited address before then. */
  userId: string;
  email: string;
  name?: string | null;
  role: ProjectRole;
  status: MemberStatus;
  /** What the invitation was *for*, kept after it is accepted. */
  invitedEmail?: string | null;
  invitedBy?: string | null;
  invitedAt: string;
  joinedAt?: string | null;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function requireEmail(value: string): string {
  const email = normalizeEmail(value);
  if (!email) throw new HttpError(400, 'BAD_REQUEST', 'email is required', { field: 'email' });
  if (!isValidEmail(email)) {
    throw new HttpError(400, 'BAD_REQUEST', 'email must be a valid address', { field: 'email' });
  }
  return email;
}

/** The caller's own membership, or the offer addressed to them. */
export async function getMembership(
  projectId: string,
  memberKey: string,
): Promise<MemberRow | undefined> {
  return getItem<MemberRow>('MembersTable', Keys.member(projectId, memberKey));
}

/** A project's roster, invitations included — they are one list to whoever reads it. */
export async function listMembers(projectId: string): Promise<MemberRow[]> {
  const rows = await queryAll<MemberRow>('MembersTable', {
    keyCondition: '#projectId = :projectId',
    names: { '#projectId': 'projectId' },
    values: { ':projectId': projectId },
  });

  // Active members first, and each group in the order it was joined: a roster
  // that reordered itself whenever somebody was invited would be a list nobody
  // could learn.
  const rank = (row: MemberRow): number => (row.status === 'ACTIVE' ? 0 : 1);
  return rows.sort((a, b) => rank(a) - rank(b) || a.invitedAt.localeCompare(b.invitedAt));
}

export function toApiMember(row: MemberRow, viewerId: string): Member {
  return {
    projectId: row.projectId,
    userId: row.userId,
    email: row.email,
    name: row.name ?? null,
    role: row.role,
    status: row.status,
    invitedEmail: row.invitedEmail ?? null,
    invitedBy: row.invitedBy ?? null,
    invitedAt: row.invitedAt,
    joinedAt: row.joinedAt ?? null,
    isYou: row.userId === viewerId,
  };
}

/**
 * The projects a person belongs to.
 *
 * `UserProjectIndex` and not a filtered table read: only an accepted membership
 * is keyed by the `sub`, so an invitation cannot appear here even by accident —
 * the index answers "projects I am in" because of how the rows are keyed rather
 * than because a filter remembered to exclude something.
 */
export async function listMembershipsForUser(userId: string): Promise<MemberRow[]> {
  return queryAll<MemberRow>('MembersTable', {
    index: 'UserProjectIndex',
    keyCondition: '#userId = :userId',
    names: { '#userId': 'userId' },
    values: { ':userId': userId },
  });
}

/** Offers addressed to one address and not yet accepted. */
export async function listInvitationsForEmail(email: string): Promise<MemberRow[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const rows = await queryAll<MemberRow>('MembersTable', {
    index: 'InviteEmailIndex',
    keyCondition: '#invitedEmail = :invitedEmail',
    names: { '#invitedEmail': 'invitedEmail' },
    values: { ':invitedEmail': normalized },
  });

  // The index is on the address, and a row keeps its `invitedEmail` after it is
  // accepted — that field is the history of how the person arrived, which a
  // roster screen shows. So the status filter is here rather than in the index.
  return rows.filter((row) => row.status === 'INVITED');
}

export interface InviteInput {
  projectId: string;
  email: string;
  role: ProjectRole;
  invitedBy: string;
  name?: string | null;
}

export async function inviteMember(input: InviteInput): Promise<MemberRow> {
  const email = requireEmail(input.email);
  const now = new Date().toISOString();

  const row: MemberRow = {
    projectId: input.projectId,
    memberKey: email,
    userId: email,
    email,
    name: input.name ?? null,
    role: input.role,
    status: 'INVITED',
    invitedEmail: email,
    invitedBy: input.invitedBy,
    invitedAt: now,
    joinedAt: null,
  };

  const written = await putIfAbsent('MembersTable', row as unknown as Item, 'memberKey');
  if (!written) {
    throw new HttpError(409, 'MEMBER_EXISTS', `${email} has already been invited`, {
      email,
    });
  }
  return row;
}

/** Changes a role, by the member's own key — the address if they have not accepted. */
export async function updateMemberRole(
  projectId: string,
  memberKey: string,
  role: ProjectRole,
): Promise<MemberRow> {
  const row = await tryUpdateItem<MemberRow>('MembersTable', Keys.member(projectId, memberKey), {
    set: { role },
    condition: 'attribute_exists(#key)',
    names: { '#key': 'memberKey' },
    returnValues: 'ALL_NEW',
  });
  if (!row.item) throw new HttpError(404, 'NOT_FOUND', 'Member not found');
  return row.item;
}

/**
 * Removes a member or revokes an invitation.
 *
 * The counter moves only when a row was actually removed and only when that row
 * was an ACTIVE membership: the count is of people in the project, so losing an
 * invitation nobody accepted must not subtract anybody.
 */
export async function removeMember(projectId: string, memberKey: string): Promise<MemberRow> {
  const existing = await getMembership(projectId, memberKey);
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Member not found');

  const removed = await deleteItem('MembersTable', Keys.member(projectId, memberKey), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'memberKey' },
  });
  if (!removed.deleted) throw new HttpError(404, 'NOT_FOUND', 'Member not found');

  if (existing.status === 'ACTIVE') {
    await moveMemberCount(projectId, -1);
  }
  return existing;
}

/**
 * Re-sends the offer by refreshing when it was made — the row is the offer.
 *
 * The role moves too, when one is given: re-inviting somebody is also how an
 * admin offers them a different place, and a route that could only re-date the
 * offer would leave taking an invitation back as the only way to change it.
 */
export async function resendInvitation(
  projectId: string,
  memberKey: string,
  invitedBy: string,
  role?: ProjectRole,
): Promise<MemberRow> {
  const row = await tryUpdateItem<MemberRow>('MembersTable', Keys.member(projectId, memberKey), {
    set: { invitedAt: new Date().toISOString(), invitedBy, ...(role ? { role } : {}) },
    condition: '#status = :invited',
    names: { '#status': 'status' },
    values: { ':invited': 'INVITED' },
    returnValues: 'ALL_NEW',
  });
  if (!row.item) {
    throw new HttpError(409, 'NOT_AN_INVITATION', 'That member has already accepted', {
      memberKey,
    });
  }
  return row.item;
}

export interface AcceptInput {
  projectId: string;
  userId: string;
  email: string;
  name?: string | null;
  /** The key the invitation is stored under, which is the address it went to. */
  invitedEmail: string;
}

/**
 * Turns an offer into a membership, in one transaction.
 *
 * Two rows change and both have to: the invitation is deleted and the
 * membership written under the caller's `sub`. Half of that pair is worse than
 * neither — an invitation that has been consumed but grants nothing is a person
 * who cannot accept again, and a membership written while the offer survives is
 * a roster that lists them twice.
 */
export async function acceptInvitation(input: AcceptInput): Promise<MemberRow> {
  const email = normalizeEmail(input.invitedEmail);
  const invitation = await getMembership(input.projectId, email);
  if (!invitation || invitation.status !== 'INVITED') {
    throw new HttpError(404, 'NOT_FOUND', 'No invitation for this project');
  }

  const already = await getMembership(input.projectId, input.userId);
  if (already?.status === 'ACTIVE') {
    // Accepting twice is not an error, and the answer is the membership they
    // already have rather than a second copy of it.
    return already;
  }

  const now = new Date().toISOString();
  const row: MemberRow = {
    projectId: input.projectId,
    memberKey: input.userId,
    userId: input.userId,
    email: normalizeEmail(input.email) || email,
    name: input.name ?? invitation.name ?? null,
    role: invitation.role,
    status: 'ACTIVE',
    invitedEmail: email,
    invitedBy: invitation.invitedBy ?? null,
    invitedAt: invitation.invitedAt,
    joinedAt: now,
  };

  await transactWrite([
    putAction('MembersTable', row as unknown as Item, {
      condition: 'attribute_not_exists(#key)',
      names: { '#key': 'memberKey' },
    }),
    deleteAction('MembersTable', Keys.member(input.projectId, email), {
      condition: 'attribute_exists(#key)',
      names: { '#key': 'memberKey' },
    }),
  ]);

  await moveMemberCount(input.projectId, 1);
  return row;
}

/**
 * Moves the project's member count.
 *
 * A second write rather than a third item in the transaction above, and that is
 * a decision about what matters: the count is derived bookkeeping, and a
 * transaction that refused an acceptance because a counter row was missing would
 * be refusing a person entry over a number. A count that misses by one is one
 * too low until the next change to the roster, which is where it is read.
 */
async function moveMemberCount(projectId: string, delta: number): Promise<void> {
  await updateItem('ProjectsTable', Keys.project(projectId), { inc: { memberCount: delta } });
}

/** How many projects a person is an active member of. What `GET /me` counts. */
export async function countProjectsForUser(userId: string): Promise<number> {
  return countQuery('MembersTable', {
    index: 'UserProjectIndex',
    keyCondition: '#userId = :userId',
    names: { '#userId': 'userId' },
    values: { ':userId': userId },
  });
}

/** Removes every membership of a project — the cascade, parent row last. */
export async function deleteMembersOfProject(projectId: string): Promise<number> {
  const rows = await listMembers(projectId);
  let removed = 0;
  for (const row of rows) {
    const result = await deleteItem('MembersTable', Keys.member(projectId, row.memberKey));
    if (result.deleted) removed += 1;
  }
  return removed;
}

/** Writes a membership row that is already whole — the owner of a new project. */
export async function putMemberIfAbsent(row: MemberRow): Promise<boolean> {
  return putIfAbsent('MembersTable', row as unknown as Item, 'memberKey');
}
