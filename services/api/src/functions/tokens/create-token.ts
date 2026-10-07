import { PROJECT_ROLES, type ProjectRole } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { getDataset } from '../../lib/datasets';
import {
  HttpError,
  created,
  jsonBody,
  pathParam,
  requiredStringField,
  stringField,
  withHandler,
} from '../../lib/http';
import { issueToken } from '../../lib/tokens';

/** The role a body asks for, refused unless it is one a member could hold. */
function requireRole(value: string): ProjectRole {
  const role = PROJECT_ROLES.find((candidate) => candidate === value);
  if (!role) {
    throw new HttpError(400, 'BAD_REQUEST', `role must be one of ${PROJECT_ROLES.join(', ')}`, {
      field: 'role',
    });
  }
  return role;
}

/**
 * Issues an API token for a project.
 *
 * This is the only response in this API that carries a secret, and it is the
 * only time it can be read: what is stored is the secret's SHA-256, so a token
 * that is lost is revoked and reissued rather than recovered. That is why the
 * whole credential is in the body rather than something a client can fetch
 * again — a route that could show it twice would be a route worth stealing.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'admin');

  const body = jsonBody(event);
  const name = requiredStringField(body, 'name');
  const role = requireRole(requiredStringField(body, 'role'));
  // Absent, or empty, means the whole project — which is `null` on the row and
  // is what a token with no dataset scope is.
  const dataset = stringField(body, 'dataset') || null;

  if (dataset && !(await getDataset(projectId, dataset))) {
    // A token scoped to a dataset that is not here would be a credential that
    // never works, so the scope is checked against the project at the moment it
    // is granted rather than being discovered by the first caller to use it.
    throw new HttpError(404, 'DATASET_NOT_FOUND', `Dataset ${dataset} not found`, { dataset });
  }

  const token = await issueToken({
    projectId,
    name,
    role,
    dataset,
    createdBy: viewer.userId,
  });

  return created(token);
});
