/**
 * `GET /v1/projects` — the projects the caller can open, each with their role on
 * it.
 *
 * Two sources for one shape, because the two principals know their projects
 * differently: a person's come from the membership index, keyed by their id, and
 * a token's is the one project it was issued for. Filtering a membership list
 * would be the wrong instrument for the second — a token has no membership row
 * at all.
 */

import type { ListResponse, Project } from '@achar/types';
import { isTokenViewer, requireViewer } from '../../lib/auth';
import { withHandler } from '../../lib/http';
import { listMembershipsForUser } from '../../lib/members';
import { listProjectsForUser, requireProject, toProject } from '../../lib/projects';

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);

  let items: Project[];
  if (isTokenViewer(viewer)) {
    const record = await requireProject(viewer.token.projectId);
    items = [toProject(record, viewer.token.role)];
  } else {
    items = await listProjectsForUser(await listMembershipsForUser(viewer.userId));
  }

  // Both branches read the whole set, so there is no page left to name.
  const projects: ListResponse<Project> = { items, nextToken: null };
  return projects;
});
