import type { Project } from '@achar/types';

import type { ApiContext } from '../../lib/context';

/** What it takes to make a project. The caller becomes its admin. */
export interface CreateProjectBody {
  name: string;
  organizationName?: string;
}

/**
 * What may be changed about one.
 *
 * `description` is here without a matching field on `Project`: the route accepts
 * it for an organization's own records and the read does not hand it back, which
 * is a gap worth naming rather than quietly leaving the parameter out.
 */
export interface UpdateProjectBody {
  name?: string;
  organizationName?: string;
  description?: string;
}

/** The projects the caller is an active member of, newest first. */
export function listProjects(api: ApiContext): Promise<Project[]> {
  return api.get<Project[]>('/v1/projects');
}

export function createProject(api: ApiContext, body: CreateProjectBody): Promise<Project> {
  return api.post<Project>('/v1/projects', body);
}

export function getProject(api: ApiContext, projectId: string): Promise<Project> {
  return api.get<Project>(`/v1/projects/${projectId}`);
}

export function updateProject(
  api: ApiContext,
  projectId: string,
  body: UpdateProjectBody,
): Promise<Project> {
  return api.patch<Project>(`/v1/projects/${projectId}`, body);
}

/** Deletes the project and everything under it — datasets, documents, assets. */
export function deleteProject(api: ApiContext, projectId: string): Promise<void> {
  return api.del<void>(`/v1/projects/${projectId}`);
}
