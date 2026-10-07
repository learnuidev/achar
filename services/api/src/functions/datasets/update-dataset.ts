import type { DatasetVisibility } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { toDataset, updateDataset } from '../../lib/datasets';
import {
  HttpError,
  jsonBody,
  pathParam,
  requiredStringField,
  withHandler,
} from '../../lib/http';

/** The visibility a body asks for, refused unless it is one of the two. */
function requireVisibility(value: string): DatasetVisibility {
  if (value === 'PUBLIC' || value === 'PRIVATE') return value;
  throw new HttpError(400, 'BAD_REQUEST', 'visibility must be `PUBLIC` or `PRIVATE`', {
    field: 'visibility',
  });
}

/**
 * Changes a dataset's visibility.
 *
 * Visibility is required rather than optional: it is the only thing this route
 * changes, so a body without it would be a PATCH answering 200 to a request
 * that changed nothing — which reads as a success and is not one.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const visibility = requireVisibility(requiredStringField(body, 'visibility'));

  const updated = await updateDataset(projectId, dataset, { visibility });
  return toDataset(updated);
});
