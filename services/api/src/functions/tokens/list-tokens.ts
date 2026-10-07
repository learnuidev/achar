import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { listTokens, toApiToken } from '../../lib/tokens';

/**
 * A project's API tokens, without their secrets.
 *
 * Revoked tokens are in the list and carry their `revokedAt`: a list that hid
 * them would make "did somebody take this away, and when" unanswerable from the
 * screen that took it away, which is the one question a revocation raises.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const tokens = await listTokens(projectId);
  return { items: tokens.map(toApiToken), nextToken: null };
});
