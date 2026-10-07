/**
 * Projects — the collaboration boundary.
 *
 * A project is created by one transaction that writes it and its owner's
 * membership together, and that pairing is the reason a transaction is used at
 * all: a project with no admin is a project nobody can administer, cannot be
 * deleted through the API, and cannot be repaired by any route this service
 * offers. Two ordinary writes would make that state reachable by a failure
 * between them.
 *
 * Deleting one cascades on purpose, children first and this row last. The order
 * is not cosmetic: a cascade that removed the project row first would leave
 * datasets, documents and assets that no route can reach and no owner can
 * remove, whereas a cascade interrupted half way leaves a project that is
 * visibly still there and can be deleted again.
 */

import type { Project, ProjectRole } from '@achar/types';
import {
  Keys,
  deleteItem,
  getItem,
  putAction,
  transactWrite,
  updateItem,
  type Item,
} from './dynamo';
import { HttpError } from './http';
import { shortSuffix, slugFor } from './ids';
import { deleteMembersOfProject, putMemberIfAbsent, type MemberRow } from './members';
import { listDatasetNames, deleteDatasetRow } from './datasets';
import { deleteRowsOfDataset } from './documents';
import { deleteAssetsOfProject } from './assets';
import { deleteSchema } from './schemas';
import { deleteWebhooksOfProject } from './webhooks';
import { deleteTokensOfProject } from './tokens';

export interface ProjectRecord extends Item {
  projectId: string;
  name: string;
  slug: string;
  organizationName: string;
  ownerId: string;
  memberCount: number;
  datasetCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A stored project as the API returns it.
 *
 * `role` is filled in from the caller's membership on every read rather than
 * stored, because "may I edit this" is a question every screen asks about the
 * project it is already drawing, and a second request to answer it is a second
 * request that can disagree with the first.
 */
export function toProject(record: ProjectRecord, role: ProjectRole): Project {
  return {
    projectId: record.projectId,
    name: record.name,
    slug: record.slug,
    organizationName: record.organizationName,
    ownerId: record.ownerId,
    memberCount: record.memberCount,
    datasetCount: record.datasetCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    role,
  };
}

export async function getProject(projectId: string): Promise<ProjectRecord | undefined> {
  return getItem<ProjectRecord>('ProjectsTable', Keys.project(projectId));
}

export async function requireProject(projectId: string): Promise<ProjectRecord> {
  const record = await getProject(projectId);
  if (!record) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  return record;
}

export interface CreateProjectInput {
  name: string;
  organizationName: string;
  ownerId: string;
  ownerEmail: string;
  ownerName?: string | null;
}

export async function createProject(input: CreateProjectInput): Promise<ProjectRecord> {
  const projectId = `proj_${shortSuffix(12)}`;
  const now = new Date().toISOString();

  const record: ProjectRecord = {
    projectId,
    name: input.name,
    slug: slugFor(input.name),
    organizationName: input.organizationName,
    ownerId: input.ownerId,
    memberCount: 1,
    datasetCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  const owner: MemberRow = {
    projectId,
    memberKey: input.ownerId,
    userId: input.ownerId,
    email: input.ownerEmail,
    name: input.ownerName ?? null,
    role: 'ADMIN',
    status: 'ACTIVE',
    invitedEmail: null,
    invitedBy: null,
    invitedAt: now,
    joinedAt: now,
  };

  // Both rows in one transaction — see the header. `MemberRow.email` is the
  // owner's address as the token carried it, which is the only address this API
  // can read one from.
  await transactWrite([
    putAction('ProjectsTable', record as unknown as Item, {
      condition: 'attribute_not_exists(#key)',
      names: { '#key': 'projectId' },
    }),
    putAction('MembersTable', owner as unknown as Item, {
      condition: 'attribute_not_exists(#key)',
      names: { '#key': 'memberKey' },
    }),
  ]);

  return record;
}

export interface UpdateProjectInput {
  name?: string;
  organizationName?: string;
}

export async function updateProject(
  projectId: string,
  patch: UpdateProjectInput,
): Promise<ProjectRecord> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) {
    set.name = patch.name;
    // The slug follows the name: it is derived from it, and a project whose slug
    // disagreed with its name would be one whose links are wrong forever.
    set.slug = slugFor(patch.name);
  }
  if (patch.organizationName !== undefined) set.organizationName = patch.organizationName;

  const updated = await updateItem<ProjectRecord>('ProjectsTable', Keys.project(projectId), {
    set,
    condition: 'attribute_exists(#key)',
    names: { '#key': 'projectId' },
    returnValues: 'ALL_NEW',
  });
  if (!updated) throw new HttpError(404, 'NOT_FOUND', 'Project not found');
  return updated;
}

export interface CascadeCounts {
  datasets: number;
  documents: number;
  assets: number;
  schemas: number;
  tokens: number;
  webhooks: number;
  members: number;
}

/**
 * Deletes a project and everything under it, in the only order that is safe.
 *
 * Content goes first — documents, then assets, then the dataset rows that name
 * them — because each of those is reachable from its parent's id and not from
 * the project's: a document is found through its dataset, so a dataset removed
 * first would strand every document it held. The project row is deleted last, so
 * an interrupted cascade leaves a project that still lists what is left and can
 * be deleted again.
 */
export async function deleteProject(projectId: string): Promise<CascadeCounts> {
  const counts: CascadeCounts = {
    datasets: 0,
    documents: 0,
    assets: 0,
    schemas: 0,
    tokens: 0,
    webhooks: 0,
    members: 0,
  };

  for (const dataset of await listDatasetNames(projectId)) {
    counts.documents += await deleteRowsOfDataset(projectId, dataset);
    counts.schemas += await deleteSchema(projectId, dataset) ? 1 : 0;
    counts.assets += await deleteAssetsOfProject(projectId, dataset);
    if (await deleteDatasetRow(projectId, dataset)) counts.datasets += 1;
  }

  counts.webhooks = await deleteWebhooksOfProject(projectId);
  counts.tokens = await deleteTokensOfProject(projectId);
  counts.members = await deleteMembersOfProject(projectId);

  const removed = await deleteItem('ProjectsTable', Keys.project(projectId), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'projectId' },
  });
  if (!removed.deleted) throw new HttpError(404, 'NOT_FOUND', 'Project not found');

  return counts;
}

/** Every project a person is an active member of, with their role in each. */
export async function listProjectsForUser(memberships: MemberRow[]): Promise<Project[]> {
  const projects: Project[] = [];
  for (const membership of memberships) {
    const record = await getProject(membership.projectId);
    // A membership whose project is gone is a cascade that has not finished;
    // skipping it is what keeps one stale row from failing the whole list.
    if (record) projects.push(toProject(record, membership.role));
  }
  return projects.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Adds a membership row to a project that already exists.
 *
 * `putMemberIfAbsent` rather than a plain write: the one case this guards is the
 * one that matters, which is a person being added to a project they are already
 * in — an add that would silently rewrite their role.
 */
export async function addMember(row: MemberRow): Promise<void> {
  const written = await putMemberIfAbsent(row);
  if (!written) {
    throw new HttpError(409, 'MEMBER_EXISTS', 'That person is already on this project');
  }
}
