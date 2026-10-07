import type { DatasetSchema, SchemaType } from '@achar/types';

import type { ApiContext } from '../../lib/context';

/**
 * A replacement schema.
 *
 * Only the types are sent. `projectId`, `dataset`, `revision` and `updatedAt` are
 * the server's to write — a client that sent a revision would be asking the API to
 * store its own idea of what the schema is — so the body is the part a studio
 * actually edits.
 */
export interface PutSchemaBody {
  types: SchemaType[];
}

/** The schema a dataset is authored against, with the revision it is at. */
export function getSchema(
  api: ApiContext,
  projectId: string,
  dataset: string,
): Promise<DatasetSchema> {
  return api.get<DatasetSchema>(`/v1/projects/${projectId}/datasets/${dataset}/schema`);
}

/** Replaces it, and answers with the stored schema including its new revision. */
export function putSchema(
  api: ApiContext,
  projectId: string,
  dataset: string,
  body: PutSchemaBody,
): Promise<DatasetSchema> {
  return api.put<DatasetSchema>(`/v1/projects/${projectId}/datasets/${dataset}/schema`, body);
}
