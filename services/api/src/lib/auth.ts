/**
 * Who is calling.
 *
 * Two credentials reach this API and both arrive in one header, and **both of
 * them are verified here**:
 *
 * - A **Cognito ID token**. On the management routes the gateway's JWT
 *   authorizer has already checked it and the claims are on the event, which is
 *   the fast path. On the content routes there is no authorizer — they have to
 *   accept an API token, which no JWT authorizer can be asked to understand — so
 *   the signature is verified here against the pool's JWKS.
 * - An **Achar API token**, which is opaque to API Gateway. It is looked up and
 *   its secret compared against a hash in constant time.
 *
 * `resolveViewer` is the single entry point that decides which of the two it is
 * holding, because a route that had to decide would be a route that could decide
 * wrong — and the wrong answer in one direction is content readable by anybody,
 * in the other a studio that cannot save.
 *
 * A token principal is deliberately *not* a person. It carries the role and the
 * project its creator scoped it to, so a credential handed to a build server
 * reaches one project and one dataset regardless of what its creator could do
 * afterwards — and revoking it is a field on a row rather than an awkward
 * conversation about a shared login.
 */

import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import type { ProjectRole, Viewer } from '@achar/types';
import { env } from './env';
import { HttpError, type ApiEvent } from './http';
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

/**
 * The caller behind a request, from whichever credential it carried.
 *
 * Two ways in, and which one applies is decided here rather than by the route:
 * a route that had to choose could choose wrong, and the day it did, a content
 * route would be open or a management route would stop working.
 *
 * - **A JWT authorizer's claims**, when the gateway verified the token already.
 *   This is the fast path and it is first on purpose: re-verifying what API
 *   Gateway checked would be a second signature check per request to reach the
 *   same answer.
 * - **Verified here**, for the content routes, which carry no authorizer — see
 *   `verifyIdToken`. Those routes are reached by machines with an Achar token
 *   and by the studio previewing a draft as a signed-in person, so both
 *   credentials have to work without the gateway's help.
 */
export async function resolveViewer(event: ApiEvent): Promise<ApiViewer | null> {
  const bearer = bearerToken(event);
  if (bearer && bearer.startsWith(TOKEN_PREFIX)) {
    return resolveTokenViewer(bearer);
  }

  const fromAuthorizer = viewerFromClaims(event);
  if (fromAuthorizer) return fromAuthorizer;

  if (bearer) return verifyIdToken(bearer);
  return null;
}

/** Resolves `achar_<tokenId>_<secret>`, or `null` when it is not a working credential. */
async function resolveTokenViewer(bearer: string): Promise<ApiViewer | null> {
  const rest = bearer.slice(TOKEN_PREFIX.length);
  // The **first** underscore is the separator, and that is only sound because of
  // what the two halves are: a token id is a ULID — Crockford base32, whose
  // alphabet has no underscore — while the secret is base64url, which has them
  // often. Splitting at the last underscore instead would cut a secret in half
  // roughly one time in three.
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

// ─────────────────────────────────────────────────────────────────────────────
// Cognito ID tokens
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The pool's signing keys, by `kid`.
 *
 * Held in module scope for the life of the container. Cognito rotates its keys
 * rarely and publishes the new one before it signs with it, so a cache that is
 * only ever refilled on a miss is correct as well as cheap — and a fetch per
 * request would put a network round trip on every content read, which for a
 * public dataset is the difference between one request and two.
 */
let signingKeys: Map<string, KeyObject> | undefined;

function jwksUrl(): string {
  return `https://cognito-idp.${env.region}.amazonaws.com/${env.userPoolId}/.well-known/jwks.json`;
}

async function loadSigningKeys(): Promise<Map<string, KeyObject>> {
  // Bounded, because this call is on the request path for the content routes: an
  // endpoint that accepts a connection and then says nothing would hold the
  // invocation to its own timeout, and a 401 is a better answer than a 504.
  const response = await fetch(jwksUrl(), { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) {
    throw new Error(`The user pool's JWKS answered ${response.status}`);
  }

  const body = (await response.json()) as { keys?: JwkKey[] };
  const keys = new Map<string, KeyObject>();
  for (const key of body.keys ?? []) {
    if (!key.kid || key.kty !== 'RSA') continue;
    // Straight from the JWK. Node builds the RSA public key from `n` and `e`,
    // so a signature can be checked with `node:crypto` and nothing else.
    keys.set(key.kid, createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' }));
  }

  signingKeys = keys;
  return keys;
}

interface JwkKey {
  kid?: string;
  kty?: string;
  n?: string;
  e?: string;
}

/**
 * A Cognito ID token, verified rather than decoded.
 *
 * This exists for the content routes, which carry no gateway authorizer so that
 * an Achar API token can reach them. A signed-in person previewing a draft is
 * the other caller of those routes, and the alternative to verifying their ID
 * token here is trusting whatever a bearer happens to say — which is not
 * authentication, it is a `sub` field a stranger can type.
 *
 * Everything about an ID token that can be checked is checked: the RS256
 * signature against the pool's own published key, the issuer, the audience (this
 * app client), `token_use` (an *access* token is not an identity and does not
 * carry an email), and the expiry. `alg` is pinned to RS256 before the key is
 * chosen, so a token claiming `alg: none` — the oldest trick there is — never
 * reaches a verification call.
 *
 * A `kid` that is not in the cache is what a rotation looks like, so the keys
 * are refetched exactly once before the token is refused.
 */
export async function verifyIdToken(token: string): Promise<ApiViewer | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const header = decodeSegment(parts[0]);
  const payload = decodeSegment(parts[1]);
  if (!header || !payload) return null;
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return null;

  const signed = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
  const signature = Buffer.from(parts[2], 'base64url');

  const known = signingKeys ?? (await loadSigningKeys());
  const key = known.get(header.kid) ?? (await loadSigningKeys()).get(header.kid);
  if (!key) return null;

  if (!verify('RSA-SHA256', signed, key, signature)) return null;

  const issuer = `https://cognito-idp.${env.region}.amazonaws.com/${env.userPoolId}`;
  if (payload.iss !== issuer) return null;
  if (payload.aud !== env.userPoolClientId) return null;
  if (payload.token_use !== 'id') return null;
  if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;

  const userId = payload.sub;
  if (typeof userId !== 'string' || !userId) return null;

  return {
    kind: 'user',
    userId,
    email: typeof payload.email === 'string' ? payload.email : '',
    ...(typeof payload.name === 'string' && payload.name ? { name: payload.name } : {}),
  };
}

interface TokenHeader {
  alg?: string;
  kid?: string;
}

/**
 * One JWT segment, as an object — or `null`.
 *
 * `unknown` in and a checked shape out, because this runs on a string a stranger
 * chose: a segment that is not base64url, not JSON, or JSON that is not an
 * object is a token to refuse rather than a token to throw over.
 */
function decodeSegment(segment: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

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
