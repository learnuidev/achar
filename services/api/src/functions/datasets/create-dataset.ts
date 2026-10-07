import type { DatasetVisibility } from '@achar/types';
import { requireProjectAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { createDataset, requireDatasetName, toDataset } from '../../lib/datasets';
import {
  HttpError,
  created,
  jsonBody,
  listField,
  pathParam,
  stringField,
  withHandler,
} from '../../lib/http';

/**
 * The visibility a body asks for, refused unless it is one of the two.
 *
 * A dataset nothing asked to publish is private, so that is the default and the
 * only other accepted value is the explicit opt-in.
 */
function requireVisibility(value: string): DatasetVisibility {
  if (value === 'PUBLIC' || value === 'PRIVATE') return value;
  throw new HttpError(400, 'BAD_REQUEST', 'visibility must be `PUBLIC` or `PRIVATE`', {
    field: 'visibility',
  });
}

/** A list of language codes as the body sent it: strings, and checked further down. */
function requireLanguageList(value: unknown[]): string[] {
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Makes a dataset in a project.
 *
 * The name is read as `datasetName` or as `name`, whichever the body carries —
 * they are one field under two spellings, and a client that guessed the shorter
 * one should not have to learn the longer one from a 400.
 *
 * `languages` and `defaultLanguage` are optional, and a dataset made without them
 * is English — see `createDataset`. They are accepted here as well as on the PATCH
 * so that a script setting up a bilingual dataset does it in one request rather
 * than two, which is the difference between a migration that is atomic and one that
 * leaves a dataset in the wrong language if the second call fails.
 */
export const handler = withHandler(async (event) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');

  await requireProjectAccess(projectId, viewer, 'write');

  const body = jsonBody(event);
  const seed = stringField(body, 'datasetName') ?? stringField(body, 'name');
  const datasetName = requireDatasetName(seed ?? '');
  const visibility = requireVisibility(stringField(body, 'visibility') ?? 'PRIVATE');
  const languages = listField(body, 'languages');

  // Nothing is read before this write: a name is unique within its project and
  // `createDataset` is the one place that decides so, which is what makes the
  // 409 the answer rather than a race between a check and an insert.
  const dataset = await createDataset({
    projectId,
    datasetName,
    visibility,
    ...(languages === undefined
      ? {}
      : {
          languages: requireLanguageList(languages),
          defaultLanguage: stringField(body, 'defaultLanguage'),
        }),
  });

  return created(toDataset(dataset));
});
