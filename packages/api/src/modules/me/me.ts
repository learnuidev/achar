import type { ApiInfo, Invitation, Profile } from '@achar/types';

import type { ApiContext } from '../../lib/context';

/** The service itself: name, version, stage, region. */
export function info(api: ApiContext): Promise<ApiInfo> {
  return api.get<ApiInfo>('/v1/info');
}

/** The caller, and the two counts a dashboard shows beside them. */
export function me(api: ApiContext): Promise<Profile> {
  return api.get<Profile>('/v1/me');
}

/** Offers addressed to the caller's own verified address, wherever they are from. */
export function myInvitations(api: ApiContext): Promise<Invitation[]> {
  return api.get<Invitation[]>('/v1/me/invitations');
}
