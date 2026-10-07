import type { ApiToken, IssuedApiToken, ProjectRole } from '@achar/types';

import { segment, type ApiContext } from '../../lib/context';

/** A token to issue: what to call it, what it may do, and where. */
export interface CreateTokenBody {
  name: string;
  role: ProjectRole;
  /** One dataset, or `null` for every dataset in the project. */
  dataset?: string | null;
}

/** The project's tokens. Never a secret — that is only ever handed over once. */
export function listTokens(api: ApiContext, projectId: string): Promise<ApiToken[]> {
  return api.get<ApiToken[]>(`/v1/projects/${projectId}/tokens`);
}

/** Issues one. The response carries the secret, and nothing will ever show it again. */
export function createToken(
  api: ApiContext,
  projectId: string,
  body: CreateTokenBody,
): Promise<IssuedApiToken> {
  return api.post<IssuedApiToken>(`/v1/projects/${projectId}/tokens`, body);
}

/** Revokes one, which stops it authenticating on its next call rather than at expiry. */
export function revokeToken(
  api: ApiContext,
  projectId: string,
  tokenId: string,
): Promise<void> {
  return api.del<void>(`/v1/projects/${projectId}/tokens/${segment(tokenId)}`);
}
