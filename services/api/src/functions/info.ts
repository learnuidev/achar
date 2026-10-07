/**
 * `GET /v1/info` — what this deployment is, answered without a token.
 *
 * The one route in this service with no authorizer, and the one route that must
 * never answer 401: it exists so that a deployment can be asked whether it is
 * up, which a route that refuses anonymous callers cannot answer. `resolveViewer`
 * answers `null` where `requireViewer` would throw, and the absence of a viewer
 * changes exactly one boolean here.
 */

import type { ApiInfo } from '@achar/types';
import { resolveViewer } from '../lib/auth';
import { env } from '../lib/env';
import { withHandler } from '../lib/http';

export const handler = withHandler(async (event) => {
  const viewer = await resolveViewer(event);

  const info: ApiInfo = {
    service: 'achar',
    version: env.version,
    stage: env.stage,
    region: env.region,
    authenticated: viewer !== null,
  };

  return info;
});
