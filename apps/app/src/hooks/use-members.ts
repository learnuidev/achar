'use client';

import type { Member } from '@achar/types';
import { asList } from '@/lib/api-shapes';
import { useResource, type Resource } from '@/hooks/use-resource';

/**
 * A project's roster, invitations included.
 *
 * Both in one read because they are one list to the person reading it: "who is
 * on this project" is answered by the people and by the people who have been
 * asked, and a screen that fetched them separately would draw two lists that
 * disagree for as long as one of them is loading.
 */
export function useMembers(projectId: string): Resource<Member[]> {
  return useResource(`members:${projectId}`, async (client) =>
    asList<Member>(await client.listMembers(projectId)),
  );
}
