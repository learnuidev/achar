/**
 * `PATCH /v1/projects/{p}` — rename a project, or rewrite what it says about
 * itself.
 *
 * Both fields are optional and at least one is required: a patch carrying
 * neither is a request whose intent cannot be told from a client that lost its
 * body, and answering 200 to it would report a change that was never asked for.
 */

import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { HttpError, jsonBody, pathParam, stringField, withHandler } from '../../lib/http';
import { toProject, updateProject } from '../../lib/projects';

/** The longest a project name may be. */
const MAX_NAME_LENGTH = 120;

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  const access = await requireProjectAccess(projectId, viewer, 'admin');

  const body = jsonBody(event);
  const name = stringField(body, 'name');
  const organizationName = stringField(body, 'organizationName');

  if (name === undefined && organizationName === undefined) {
    throw new HttpError(400, 'BAD_REQUEST', 'Provide a name or an organizationName');
  }
  // `stringField` trims, so an empty string here is a value somebody sent and
  // not an omission: writing it would leave the project named by nothing.
  if (name !== undefined && (!name || name.length > MAX_NAME_LENGTH)) {
    throw new HttpError(400, 'BAD_REQUEST', `name must be 1 to ${MAX_NAME_LENGTH} characters`, {
      field: 'name',
    });
  }
  if (organizationName !== undefined && !organizationName) {
    throw new HttpError(400, 'BAD_REQUEST', 'organizationName cannot be empty', {
      field: 'organizationName',
    });
  }

  const updated = await updateProject(projectId, {
    ...(name === undefined ? {} : { name }),
    ...(organizationName === undefined ? {} : { organizationName }),
  });

  return toProject(updated, access.role);
});
