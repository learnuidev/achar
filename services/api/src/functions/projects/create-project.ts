/**
 * `POST /v1/projects` — make a project, with the caller as its owner and admin.
 *
 * A token cannot call this. It is a credential scoped to a project that already
 * exists and it carries no identity that could own a new one — and `ownerId` is
 * not decoration: it is the record of who made the project, which nothing can
 * rewrite afterwards.
 *
 * `organizationName` defaults to the project's own name, because an organization
 * is a label on the project and a first project that cannot be created without
 * typing one twice is a form field nobody asked for.
 */

import { isTokenViewer, requireViewer } from '../../lib/auth';
import {
  HttpError,
  created,
  jsonBody,
  requiredStringField,
  stringField,
  withHandler,
} from '../../lib/http';
import { createProject, toProject } from '../../lib/projects';

/** The longest a project name may be. */
const MAX_NAME_LENGTH = 120;

export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);

  if (isTokenViewer(viewer)) {
    throw new HttpError(403, 'FORBIDDEN', 'An API token cannot create a project');
  }

  const body = jsonBody(event);
  // `requiredStringField` trims, so a name of spaces is refused as absent.
  const name = requiredStringField(body, 'name');
  if (name.length > MAX_NAME_LENGTH) {
    throw new HttpError(400, 'BAD_REQUEST', `name must be at most ${MAX_NAME_LENGTH} characters`, {
      field: 'name',
    });
  }

  // `||` rather than `??`: an empty string is a missing organization name too,
  // and the default is the point of the field.
  const organizationName = stringField(body, 'organizationName') || name;

  const record = await createProject({
    name,
    organizationName,
    ownerId: viewer.userId,
    ownerEmail: viewer.email,
    ownerName: viewer.name,
  });

  // The owner's role is written into the same transaction that writes the
  // project, so it is a fact about the record rather than something to read back.
  return created(toProject(record, 'ADMIN'));
});
