'use client';

import type { Profile } from '@achar/types';
import { useResource, type Resource } from '@/hooks/use-resource';

/**
 * The caller, and the counts that decide which door they are shown.
 *
 * `projectCount` and `invitationCount` are the whole reason this exists. Both
 * doors ask the same question — has this person anything to open — and the answer
 * is not "does the list come back empty", because a list read that fails and a
 * list that is genuinely empty look the same from a `Resource`. The counts are
 * answered by the API's own `GET /v1/me`, which counts what it counts and says so.
 *
 * The two are separate facts, not one. Somebody with no projects and an
 * invitation waiting is not somebody who has to be onboarded: they have been
 * asked into a project that already exists, and the picker is where that offer is
 * accepted. See the studio's gate, which is the one caller that has to tell them
 * apart.
 */
export function useProfile(): Resource<Profile> {
  return useResource('profile', (client) => client.me());
}
