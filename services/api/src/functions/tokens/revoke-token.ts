import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { pathParam, withHandler } from '../../lib/http';
import { revokeToken, toApiToken } from '../../lib/tokens';

/**
 * Takes a token out of service.
 *
 * The row is kept rather than deleted: it is the record that a credential was
 * ever issued and by whom, so the list a project reads afterwards can still
 * answer for it. Revoking twice reports the same row rather than failing, which
 * is what makes a retry of this route safe to send again.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const tokenId = pathParam(event, 'tokenId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const revoked = await revokeToken(projectId, tokenId);
  return toApiToken(revoked);
});
