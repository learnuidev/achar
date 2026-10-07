import type { SchemaType } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { HttpError, jsonBody, listField, pathParam, withHandler } from '../../lib/http';
import { putDatasetSchema } from '../../lib/schemas';

/**
 * Whether an entry of `types` is an object at all.
 *
 * Deliberately shallow, and the one place the judgement is shallow: whether a
 * name is an identifier, whether two types share one, and everything below that
 * is `putDatasetSchema`'s to refuse, because a second opinion here would be a
 * second place for the two to disagree about what a schema is. What this keeps
 * out is a string, a number or an array arriving where a type is stored.
 */
function isTypeObject(value: unknown): value is SchemaType {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Replaces the schema a dataset is authored against. */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const types = listField(body, 'types');
  if (!types) throw new HttpError(400, 'BAD_REQUEST', 'types is required', { field: 'types' });
  if (!types.every(isTypeObject)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Every entry of types must be an object', {
      field: 'types',
    });
  }

  // The revision that comes back is a hash of these types rather than a
  // timestamp, which is what makes it comparable: a client holds the revision
  // it was drawn against, and the same types saved twice are one revision, so
  // nobody is told they are stale by a save that changed nothing.
  return putDatasetSchema(projectId, dataset, types);
});
