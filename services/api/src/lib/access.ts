/**
 * The authorization policy, in one file.
 *
 * Every route asks one of these two functions and nothing else, which is what
 * makes the policy readable in one sitting: a rule that lived in a handler would
 * be a rule that quietly stopped applying to the next handler somebody wrote.
 *
 * Two answers are deliberate. A project that does not exist and a project the
 * caller is not in both answer **403**: the API never says which project ids are
 * real, so a stranger cannot walk the id space and learn where the tenants are.
 * And an invitation is not a membership — a row with `status: 'INVITED'` grants
 * nothing at all, because an offer nobody has accepted is not access.
 */

import type { ProjectRole } from '@achar/types';
import type { ApiViewer } from './auth';
import { isTokenViewer } from './auth';
import { HttpError } from './http';
import { getMembership, type MemberRow } from './members';
import { getProject, type ProjectRecord } from './projects';
import { getDataset, type DatasetRecord } from './datasets';

export type AccessAction = 'read' | 'write' | 'admin';

/** Roles that may change content. A `VIEWER` reads and publishes nothing. */
const WRITE_ROLES: readonly ProjectRole[] = ['ADMIN', 'EDITOR'];

export function canWrite(role: ProjectRole): boolean {
  return WRITE_ROLES.includes(role);
}

function roleSatisfies(role: ProjectRole, action: AccessAction): boolean {
  if (action === 'read') return true;
  if (action === 'write') return WRITE_ROLES.includes(role);
  return role === 'ADMIN';
}

function forbidden(message = 'Forbidden'): HttpError {
  return new HttpError(403, 'FORBIDDEN', message);
}

export interface ProjectAccess {
  projectId: string;
  /** The caller's role, whichever kind of principal they are. */
  role: ProjectRole;
  project: ProjectRecord;
  /** The membership row. Absent for a token principal, which has none. */
  member?: MemberRow;
}

/**
 * Authorizes a caller against a project and answers their role.
 *
 * A token principal is authorized by its own scope rather than by a membership:
 * a token is the project's credential, issued by an admin and revocable on its
 * own, so it keeps working when the person who issued it leaves — which is what
 * makes it usable by a build server at all. What keeps that safe is that the
 * token's role is checked exactly as a member's would be, and its project has to
 * match the one in the path.
 */
export async function requireProjectAccess(
  projectId: string,
  viewer: ApiViewer,
  action: AccessAction,
): Promise<ProjectAccess> {
  if (isTokenViewer(viewer)) {
    if (viewer.token.projectId !== projectId) throw forbidden();
    if (!roleSatisfies(viewer.token.role, action)) throw forbidden();
    // A token outlives the project row unless the cascade removed it, and this
    // read is what stops a deleted project from being reachable through one.
    const project = await getProject(projectId);
    if (!project) throw forbidden();
    return { projectId, role: viewer.token.role, project };
  }

  const member = await getMembership(projectId, viewer.userId);
  if (!member || member.status !== 'ACTIVE') throw forbidden();
  if (!roleSatisfies(member.role, action)) {
    throw forbidden(`A ${member.role.toLowerCase()} cannot do that in this project`);
  }

  const project = await getProject(projectId);
  if (!project) throw forbidden();

  return { projectId, role: member.role, project, member };
}

export interface DatasetAccess extends ProjectAccess {
  dataset: DatasetRecord;
}

/**
 * Authorizes a caller against one dataset.
 *
 * The project rule first, then the token's dataset scope, then the row. The 404
 * for a dataset that is not there is safe to give: the caller has already proven
 * they belong to the project, so the only thing it tells them is something they
 * could see in the project's own listing.
 */
export async function requireDatasetAccess(
  projectId: string,
  dataset: string,
  viewer: ApiViewer,
  action: AccessAction,
): Promise<DatasetAccess> {
  if (isTokenViewer(viewer) && viewer.token.dataset && viewer.token.dataset !== dataset) {
    throw forbidden('That token is scoped to another dataset');
  }

  const access = await requireProjectAccess(projectId, viewer, action);
  const record = await getDataset(projectId, dataset);
  if (!record) {
    throw new HttpError(404, 'DATASET_NOT_FOUND', `Dataset ${dataset} not found`, { dataset });
  }

  return { ...access, dataset: record };
}

/**
 * Authorizes the one thing only a project's owner may do: delete it.
 *
 * Ownership is a property of a person, so a token can never hold it — a
 * machine credential that could delete the project it was issued for is a
 * credential worth stealing rather than one worth issuing. An admin who is not
 * the owner is refused here even though `admin` would otherwise pass.
 */
export async function requireProjectOwner(
  projectId: string,
  viewer: ApiViewer,
): Promise<ProjectAccess> {
  const access = await requireProjectAccess(projectId, viewer, 'admin');
  if (viewer.kind === 'token' || access.project.ownerId !== viewer.userId) {
    throw forbidden('Only the owner can delete this project');
  }
  return access;
}
