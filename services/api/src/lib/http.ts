/**
 * The HTTP edge: one error type, one response shape, one wrapper.
 *
 * Everything a handler throws on purpose is an `HttpError`, and everything a
 * handler returns is a body `withHandler` serializes. The consequence worth
 * stating is that no handler ever writes a status code by hand, which is what
 * makes the error envelope below the only error envelope the API has.
 *
 * CORS is not here: API Gateway's own CORS configuration answers the preflight
 * and adds the headers, because a Lambda that has to be correct about allowed
 * origins as well as about its own domain is two problems in one place.
 */

import type {
  APIGatewayEventRequestContextJWTAuthorizer,
  APIGatewayEventRequestContextV2,
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { ApiErrorBody } from '@achar/types';

/**
 * An HTTP API v2 event with the JWT authorizer's context on it.
 *
 * `APIGatewayProxyEventV2` does not declare `requestContext.authorizer` at all —
 * only the with-authorizer variants do — but this API has one authorizer and one
 * route (`GET /v1/info`) without it, so the authorizer is optional here rather
 * than absent from the type. That is also why `resolveViewer` can answer `null`
 * for a route that has no claims.
 */
export type ApiEvent = Omit<APIGatewayProxyEventV2, 'requestContext'> & {
  requestContext: APIGatewayEventRequestContextV2 & {
    authorizer?: APIGatewayEventRequestContextJWTAuthorizer;
  };
};

/** The one error a handler throws on purpose. */
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const RESPONSE = Symbol('achar.response');

/**
 * A status and a body, on their way out.
 *
 * Branded rather than recognized by shape: a handler returning a document that
 * happens to carry `status` and `body` fields must not be mistaken for a
 * response, and a symbol cannot collide with anything a document is allowed to
 * contain.
 */
export interface RouteResponse {
  readonly [RESPONSE]: true;
  status: number;
  body: unknown;
}

export function json(body: unknown, status = 200): RouteResponse {
  return { [RESPONSE]: true, status, body };
}

export function created(body: unknown): RouteResponse {
  return json(body, 201);
}

export function noContent(): RouteResponse {
  return json(null, 204);
}

function isRouteResponse(value: unknown): value is RouteResponse {
  return typeof value === 'object' && value !== null && RESPONSE in value;
}

export function errorBody(error: HttpError): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

/**
 * A 500 is the envelope and nothing else.
 *
 * The real error goes to the log, where CloudWatch keeps it with the request id.
 * A stack trace in a response body is a stack trace handed to whoever asked for
 * a route, and the handler cannot tell a caller worth trusting from one who is
 * probing.
 */
function internalError(error: unknown): RouteResponse {
  console.error('Unhandled error', error);
  return json(
    { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } } satisfies ApiErrorBody,
    500,
  );
}

type Route = (event: ApiEvent) => Promise<unknown>;

/**
 * Wraps a route so every answer leaves through one door.
 *
 * The returned value is serialized as a 200 when a handler returns a plain
 * object or array, which is what lets the common case read as `return project`
 * rather than as three lines about status codes.
 */
function respond(response: RouteResponse): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: response.status,
    headers: { 'content-type': 'application/json' },
    body: response.body === null ? '' : JSON.stringify(response.body),
  };
}

export function withHandler(route: Route) {
  return async (event: ApiEvent): Promise<APIGatewayProxyResultV2> => {
    try {
      const result = await route(event);
      return respond(isRouteResponse(result) ? result : json(result ?? null));
    } catch (error) {
      if (error instanceof HttpError) return respond(json(errorBody(error), error.status));
      return respond(internalError(error));
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reading the request
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Names a route template might use for a path parameter.
 *
 * The route table is generated and edited by hand elsewhere in this repository,
 * and a parameter name is not part of that contract — the *order* of the
 * segments is. So a lookup tries the name this service documents, then the short
 * spelling the architecture doc writes its table with, and finally, when a route
 * has exactly one parameter, whatever that parameter is called.
 */
const PARAM_ALIASES: Record<string, readonly string[]> = {
  projectId: ['p', 'project'],
  dataset: ['d', 'datasetName'],
  docId: ['documentId', 'id'],
  assetId: ['asset'],
  userId: ['memberId', 'memberUserId'],
  webhookId: ['webhook'],
  tokenId: ['token'],
};

export function pathParam(event: ApiEvent, name: string): string {
  const params = event.pathParameters ?? {};
  const candidates = [name, ...(PARAM_ALIASES[name] ?? [])];

  for (const candidate of candidates) {
    const value = params[candidate];
    if (value) return decode(value, name);
  }

  const values = Object.values(params).filter((value): value is string => Boolean(value));
  if (values.length === 1) return decode(values[0], name);

  throw new HttpError(400, 'BAD_REQUEST', `${name} path parameter is required`);
}

function decode(value: string, name: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', `Invalid ${name} path parameter`);
  }
}

/** A query-string parameter, or `undefined` when it was not sent. */
export function queryParam(event: ApiEvent, name: string): string | undefined {
  const value = event.queryStringParameters?.[name];
  return value ? value : undefined;
}

export function jsonBody(event: ApiEvent): Record<string, unknown> {
  if (!event.body) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(event.body);
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body must be valid JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

export function stringField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'BAD_REQUEST', `${key} must be a string`, { field: key });
  }
  return value.trim();
}

export function requiredStringField(body: Record<string, unknown>, key: string): string {
  const value = stringField(body, key);
  if (!value) throw new HttpError(400, 'BAD_REQUEST', `${key} is required`, { field: key });
  return value;
}

export function booleanField(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'BAD_REQUEST', `${key} must be a boolean`, { field: key });
  }
  return value;
}

export function listField(body: Record<string, unknown>, key: string): unknown[] | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'BAD_REQUEST', `${key} must be an array`, { field: key });
  }
  return value;
}

export function stringListField(body: Record<string, unknown>, key: string): string[] | undefined {
  const value = listField(body, key);
  if (!value) return undefined;
  return value.map((entry) => {
    if (typeof entry !== 'string') {
      throw new HttpError(400, 'BAD_REQUEST', `${key} must be an array of strings`, { field: key });
    }
    return entry.trim();
  });
}

export function objectField(
  body: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'BAD_REQUEST', `${key} must be an object`, { field: key });
  }
  return value as Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Paging
// ─────────────────────────────────────────────────────────────────────────────

/** Page size when the caller does not ask for one. */
export const DEFAULT_LIMIT = 25;

/** Page size ceiling, so one request cannot ask for a whole table. */
export const MAX_LIMIT = 100;

export function parseLimit(raw: string | undefined, fallback = DEFAULT_LIMIT): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.min(Math.floor(value), MAX_LIMIT);
}

/**
 * A `LastEvaluatedKey` as the client sees it.
 *
 * Opaque on purpose: base64url over the key is what keeps the table's key schema
 * out of the API contract, so a next token cannot be hand-edited into a query
 * over a different index.
 */
export function encodeNextToken(key: Record<string, unknown> | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64url');
}

export function decodeNextToken(token: string | undefined): Record<string, unknown> | undefined {
  if (!token) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid nextToken');
  }
}

export function parsePaging(event: ApiEvent, fallback = DEFAULT_LIMIT): {
  limit: number;
  exclusiveStartKey?: Record<string, unknown>;
} {
  return {
    limit: parseLimit(queryParam(event, 'limit'), fallback),
    exclusiveStartKey: decodeNextToken(queryParam(event, 'nextToken')),
  };
}

/** Reads an ISO instant out of a query string, refusing anything else. */
export function parseIsoParam(event: ApiEvent, name: string): string | undefined {
  const raw = queryParam(event, name);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} must be an ISO 8601 instant`, { field: name });
  }
  return parsed.toISOString();
}
