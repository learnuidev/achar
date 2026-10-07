import type { DatasetVisibility } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { toDataset, updateDataset } from '../../lib/datasets';
import { HttpError, jsonBody, pathParam, withHandler } from '../../lib/http';

/** The visibility a body asks for, refused unless it is one of the two. */
function requireVisibility(value: unknown): DatasetVisibility {
  if (value === 'PUBLIC' || value === 'PRIVATE') return value;
  throw new HttpError(400, 'BAD_REQUEST', 'visibility must be `PUBLIC` or `PRIVATE`', {
    field: 'visibility',
  });
}

/**
 * Changes what a dataset *is*: its visibility, and the languages its content is
 * authored in.
 *
 * **This is where a language is added**, and it is a PATCH on the dataset because
 * that is what a language is — a fact about a body of content rather than about one
 * document, one project or one person. The list arrives whole, the way a schema
 * does: two clients each adding a language at the same moment would otherwise both
 * be writing "the list, plus mine", and one of them would lose without being told.
 *
 * At least one field has to be there. A PATCH that changed nothing answering 200 is
 * a success that is not one — which is why `visibility` is no longer required on its
 * own: a request that only adds French is now a request this route has to accept.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const visibility = body.visibility === undefined ? undefined : requireVisibility(body.visibility);
  const languages = body.languages;
  const defaultLanguage = body.defaultLanguage;

  if (visibility === undefined && languages === undefined && defaultLanguage === undefined) {
    throw new HttpError(
      400,
      'BAD_REQUEST',
      'A dataset change must carry visibility, languages or defaultLanguage',
      { fields: ['visibility', 'languages', 'defaultLanguage'] },
    );
  }

  const updated = await updateDataset(projectId, dataset, {
    ...(visibility === undefined ? {} : { visibility }),
    ...(languages === undefined ? {} : { languages }),
    ...(defaultLanguage === undefined ? {} : { defaultLanguage }),
  });

  return toDataset(updated);
});
