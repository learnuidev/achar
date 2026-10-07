import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { noContent, pathParam, withHandler } from '../../lib/http';
import { revokeToken } from '../../lib/tokens';

/**
 * Takes a token out of service.
 *
 * The row is kept rather than deleted: it is the record that a credential was
 * ever issued and by whom, so the list a project reads afterwards can still
 * answer for it. Revoking twice is not a failure, which is what makes a retry of
 * this route safe to send again.
 *
 * The answer is empty rather than the revoked token: the one thing a caller
 * wants it for is already in hand, and the client over this API types the route
 * as `Promise<void>` — a body nothing reads is a body somebody eventually
 * parses.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const tokenId = pathParam(event, 'tokenId');

  await requireProjectAccess(projectId, viewer, 'admin');

  await revokeToken(projectId, tokenId);
  return noContent();
});
