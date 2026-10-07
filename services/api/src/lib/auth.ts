/**
 * Who is calling.
 *
 * Two credentials reach this API and both arrive in one header. A Cognito ID
 * token was already validated by the JWT authorizer and its claims are on the
 * event; an Achar API token is opaque to API Gateway and is resolved here, by
 * looking it up and comparing a hash. `resolveViewer` answers both, and answers
 * `null` for neither — a route decides whether that is a 401 or, on `GET
 * /v1/info`, nothing at all.
 *
 * A token principal is deliberately *not* a person. It carries the role and the
 * project its creator scoped it to, so a credential handed to a build server
 * reaches one project and one dataset regardless of what its creator could do
 * afterwards — and revoking it is a field on a row rather than an awkward
 * conversation about a shared login.
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import type { ProjectRole, Viewer } from '@achar/types';
import type { ApiEvent } from './http';
import { HttpError } from './http';
import { Keys, getItem, tryUpdateItem, type Item } from './dynamo';
import type { TokenRow } from './tokens';

/** The prefix that marks a bearer as an API token rather than a JWT. */
export const TOKEN_PREFIX = 'achar_';

export type ViewerKind = 'user' | 'token';

/** What an API token carries, and the whole of what shapes a token's reach. */
export interface TokenPrincipal {
  tokenId: string;
  role: ProjectRole;
  projectId: string;
  /** One dataset, or `null` for every dataset of the project. */
  dataset?: string | null;
}

export interface ApiViewer extends Viewer {
  kind: ViewerKind;
  /** Present only on a token principal. */
  token?: TokenPrincipal;
}

export function isTokenViewer(viewer: ApiViewer): viewer is ApiViewer & { token: TokenPrincipal } {
  return viewer.kind === 'token' && viewer.token !== undefined;
}

/**
 * The bearer token, from whichever spelling of the header arrived.
 *
 * HTTP API lowercases header names, but a direct invocation — a test, the
 * console's own smoke check — does not have to, and a 401 caused by the case of
 * a header is an afternoon nobody gets back.
 */
export function bearerToken(event: ApiEvent): string | null {
  const headers = event.headers ?? {};
  const raw = headers.authorization ?? headers.Authorization;
  if (!raw) return null;
  const match = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return match ? match[1].trim() : null;
}

/**
 * The stored form of a token secret, and of a webhook signing key.
 *
 * SHA-256 without a salt, deliberately: the secret is 256 bits of `randomBytes`
 * rather than something a person chose, so there is nothing to brute-force and
 * no dictionary to run — which is the entire reason a salt exists. What it buys
 * is that a dump of `TokensTable` is not a set of working credentials.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/**
 * Compares two secrets in a time that does not depend on where they differ.
 *
 * `timingSafeEqual` needs equal lengths, so a length mismatch is answered first
 * — and that is not a leak worth avoiding: the length of a hash is not a secret,
 * and every stored hash is the same length.
 */
export function secretsMatch(candidate: string, stored: string): boolean {
  const left = Buffer.from(candidate, 'utf8');
  const right = Buffer.from(stored, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** How long a token's `lastUsedAt` is left alone before it is written again. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export async function resolveViewer(event: ApiEvent): Promise<ApiViewer | null> {
  const bearer = bearerToken(event);
  if (bearer && bearer.startsWith(TOKEN_PREFIX)) {
    return resolveTokenViewer(bearer);
  }
  return viewerFromClaims(event);
}

/** Resolves `achar_<tokenId>_<secret>`, or `null` when it is not a working credential. */
async function resolveTokenViewer(bearer: string): Promise<ApiViewer | null> {
  const rest = bearer.slice(TOKEN_PREFIX.length);
  const separator = rest.indexOf('_');
  if (separator <= 0) return null;

  const tokenId = rest.slice(0, separator);
  const secret = rest.slice(separator + 1);
  if (!secret) return null;

  const row = await getItem<TokenRow>('TokensTable', Keys.token(tokenId));
  if (!row?.secretHash) return null;
  // Revoked and wrong are the same answer: a caller holding a dead token is not
  // told whether it was ever alive.
  if (row.revokedAt) return null;
  if (!secretsMatch(hashSecret(secret), row.secretHash)) return null;

  await touchLastUsed(tokenId, row.lastUsedAt);

  return {
    kind: 'token',
    // The creator, because something has to be the id this acts as in a log
    // line and in `uploadedBy`, and the token itself is not a person.
    userId: row.createdBy,
    email: '',
    name: row.name,
    token: {
      tokenId,
      role: row.role,
      projectId: row.projectId,
      dataset: row.dataset ?? null,
    },
  };
}

/**
 * Records that a token was used, at most once an hour.
 *
 * Not on every request: this is a read path, and a write per read doubles what a
 * machine credential costs to use. The interval is the compromise — the field
 * answers "is this token still in use", which nobody reads to the second, and a
 * window that lapses still touches each token once an hour at most. A failure
 * here never fails the request: the token was valid, and a bookkeeping write is
 * not worth a 500.
 */
async function touchLastUsed(tokenId: string, lastUsedAt: string | null | undefined): Promise<void> {
  const now = new Date();
  if (lastUsedAt && now.getTime() - Date.parse(lastUsedAt) < TOUCH_INTERVAL_MS) return;

  try {
    await tryUpdateItem<Item>('TokensTable', Keys.token(tokenId), {
      set: { lastUsedAt: now.toISOString() },
      condition: 'attribute_exists(#key)',
      names: { '#key': 'tokenId' },
    });
  } catch (error) {
    console.warn('Could not record token use', error);
  }
}

/**
 * Who the JWT authorizer says is calling.
 *
 * Claims arrive as an object of strings, and a claim that is missing is not a
 * reason to invent one: without a `sub` there is no identity to authorize, so
 * this is `null` and the route answers 401.
 */
function viewerFromClaims(event: ApiEvent): ApiViewer | null {
  const claims = event.requestContext.authorizer?.jwt.claims;
  if (!claims) return null;

  const userId = claim(claims, 'sub');
  if (!userId) return null;

  const email = claim(claims, 'email');
  const name = claim(claims, 'name');

  return {
    kind: 'user',
    userId,
    email: email ?? '',
    ...(name ? { name } : {}),
  };
}

type Claims = Record<string, string | number | boolean | string[]>;

/** A claim as a string, or `undefined` when it is absent or holds something else. */
export function claim(claims: Claims, name: string): string | undefined {
  const value = claims[name];
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}

/** The viewer a route requires, with the 401 in one place. */
export async function requireViewer(event: ApiEvent): Promise<ApiViewer> {
  const viewer = await resolveViewer(event);
  if (!viewer) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Unauthorized');
  }
  return viewer;
}
