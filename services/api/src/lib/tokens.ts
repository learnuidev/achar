/**
 * API tokens, as rows.
 *
 * The plaintext secret exists in exactly one place — the response that issued it
 * — and what is stored is its SHA-256. That is why `IssuedApiToken` exists
 * beside `ApiToken` in the contract rather than a nullable `token` field: a
 * shape that can carry a secret is a shape somebody will log, and the type that
 * cannot carry one is the protection.
 */

import type { ApiToken, IssuedApiToken, ProjectRole } from '@achar/types';
import { hashSecret } from './auth';
import { Keys, deleteItem, getItem, putIfAbsent, queryAll, tryUpdateItem, type Item } from './dynamo';
import { HttpError } from './http';
import { secret, ulid } from './ids';

export interface TokenRow {
  tokenId: string;
  projectId: string;
  name: string;
  role: ProjectRole;
  /** One dataset, or `null` for the whole project. */
  dataset?: string | null;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  /** SHA-256 of the secret half of the token. Never returned. */
  secretHash: string;
}

export function toApiToken(row: TokenRow): ApiToken {
  return {
    tokenId: row.tokenId,
    projectId: row.projectId,
    name: row.name,
    role: row.role,
    dataset: row.dataset ?? null,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    lastUsedAt: row.lastUsedAt ?? null,
    revokedAt: row.revokedAt ?? null,
  };
}

/**
 * A project's tokens, newest first.
 *
 * Revoked ones are included and marked: a list that hid them would make
 * "did somebody take this away" unanswerable from the screen that took it away.
 */
export async function listTokens(projectId: string): Promise<TokenRow[]> {
  return queryAll<TokenRow>('TokensTable', {
    index: 'ProjectIndex',
    keyCondition: '#projectId = :projectId',
    names: { '#projectId': 'projectId' },
    values: { ':projectId': projectId },
    scanIndexForward: false,
  });
}

export async function getToken(projectId: string, tokenId: string): Promise<TokenRow | undefined> {
  const row = await getItem<TokenRow>('TokensTable', Keys.token(tokenId));
  // The key is the token id alone, so a token that belongs to another project
  // has to be refused here rather than being found and then checked by a caller.
  return row && row.projectId === projectId ? row : undefined;
}

export interface IssueTokenInput {
  projectId: string;
  name: string;
  role: ProjectRole;
  dataset?: string | null;
  createdBy: string;
}

export async function issueToken(input: IssueTokenInput): Promise<IssuedApiToken> {
  const tokenId = ulid();
  const plaintext = secret(32);

  const row: TokenRow = {
    tokenId,
    projectId: input.projectId,
    name: input.name,
    role: input.role,
    dataset: input.dataset ?? null,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    lastUsedAt: null,
    revokedAt: null,
    secretHash: hashSecret(plaintext),
  };

  // A token id is a fresh ULID, so a collision is not a case worth a condition
  // and a 409 branch; `putIfAbsent` is here because it is the one write that
  // would silently overwrite a credential if that ever stopped being true.
  const written = await putIfAbsent('TokensTable', row as unknown as Item, 'tokenId');
  if (!written) throw new HttpError(409, 'CONFLICT', 'That token id is already in use');

  return { ...toApiToken(row), token: `achar_${tokenId}_${plaintext}` };
}

/**
 * Takes a token out of service, leaving the row.
 *
 * Deleted rather than revoked is the choice this route deliberately does not
 * offer: a credential that stops working should still be listed afterwards, so
 * that "what was that and when did it stop" has an answer. Revoking twice is not
 * an error — the second call reports the same row.
 */
export async function revokeToken(projectId: string, tokenId: string): Promise<TokenRow> {
  const existing = await getToken(projectId, tokenId);
  if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Token not found');

  const revokedAt = new Date().toISOString();
  const outcome = await tryUpdateItem<TokenRow>('TokensTable', Keys.token(tokenId), {
    set: { revokedAt },
    condition: 'attribute_not_exists(#revokedAt)',
    names: { '#revokedAt': 'revokedAt' },
    returnValues: 'ALL_NEW',
  });

  if (outcome.changed && outcome.item) return outcome.item;
  return existing;
}

/** Removes a project's tokens outright — the cascade, where a tombstone helps nobody. */
export async function deleteTokensOfProject(projectId: string): Promise<number> {
  const rows = await listTokens(projectId);
  let removed = 0;
  for (const row of rows) {
    const result = await deleteItem('TokensTable', Keys.token(row.tokenId));
    if (result.deleted) removed += 1;
  }
  return removed;
}
