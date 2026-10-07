import type { Member, ProjectRole } from '@achar/types';

import { segment, type ApiContext } from '../../lib/context';

/** An invitation: the address to offer a role to, and the role to offer. */
export interface InviteMemberBody {
  email: string;
  role: ProjectRole;
}

/** The roster, invitations included — `Member.status` says which each row is. */
export function listMembers(api: ApiContext, projectId: string): Promise<Member[]> {
  return api.get<Member[]>(`/v1/projects/${projectId}/members`);
}

export function inviteMember(
  api: ApiContext,
  projectId: string,
  body: InviteMemberBody,
): Promise<Member> {
  return api.post<Member>(`/v1/projects/${projectId}/members`, body);
}

/** Changes a role. An invitation nobody has accepted can be corrected in place. */
export function updateMemberRole(
  api: ApiContext,
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<Member> {
  return api.patch<Member>(`/v1/projects/${projectId}/members/${segment(userId)}`, { role });
}

/** Removes a member, or withdraws an invitation nobody accepted. */
export function removeMember(
  api: ApiContext,
  projectId: string,
  userId: string,
): Promise<void> {
  return api.del<void>(`/v1/projects/${projectId}/members/${segment(userId)}`);
}

/** Sends an outstanding invitation again, optionally correcting its role. */
export function resendInvitation(
  api: ApiContext,
  projectId: string,
  userId: string,
  role?: ProjectRole,
): Promise<Member> {
  return api.post<Member>(
    `/v1/projects/${projectId}/members/${segment(userId)}/invitation`,
    role ? { role } : {},
  );
}

/** Claims the invitation addressed to the caller's own verified address. */
export function acceptInvitation(api: ApiContext, projectId: string): Promise<Member> {
  return api.post<Member>(`/v1/projects/${projectId}/invitation`);
}
