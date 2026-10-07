'use client';

import type { Invitation, Project } from '@achar/types';
import { asList } from '@/lib/api-shapes';
import { useResource, type Resource } from '@/hooks/use-resource';

/** The projects the caller belongs to, each carrying their own role in it. */
export function useProjects(): Resource<Project[]> {
  return useResource('projects', async (client) => asList<Project>(await client.listProjects()));
}

/** Offers addressed to the caller's own address, in projects they are not in yet. */
export function useInvitations(): Resource<Invitation[]> {
  return useResource('invitations', async (client) =>
    asList<Invitation>(await client.myInvitations()),
  );
}

/** One project, with the caller's role — the answer every screen needs. */
export function useProject(projectId: string): Resource<Project> {
  return useResource(`project:${projectId}`, (client) => client.getProject(projectId));
}
