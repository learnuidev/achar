import type { DatasetSchema, SchemaField, SchemaType } from '@achar/types';

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

/**
 * One content type, written on its own.
 *
 * What this body does *not* carry is the point: the types around this one. A caller
 * sending a whole `types` array has to have read it first, and that read-modify-write
 * loses a type whenever two people add one at the same moment — so the API merges
 * server-side instead, conditionally on the revision it read. `addDatasetType` on the
 * service side is where that argument is made.
 *
 * It answers 201 when the type was added and 200 when it replaced one, which is how a
 * bootstrap script tells a first run from a second. The body is the whole schema
 * either way: that is what the caller needs to go on with, revision included.
 */
export interface CreateTypeBody {
  /** The name it is filed under — what documents store as `_type` and queries name. */
  name: string;
  /** Left out means the name, made readable. */
  title?: string;
  /** Left out means `document`; `object` is for a type that is only ever a field. */
  kind?: 'document' | 'object';
  icon?: string;
  description?: string;
  fields: SchemaField[];
  /**
   * The name this write is replacing, when it is a rename.
   *
   * The body can only carry the name a type is *becoming*, so the one it is leaving is
   * stated rather than guessed. Absent, the write replaces whatever already holds
   * `name` — which is what makes sending the same type twice an update rather than a
   * second copy of it.
   */
  replaces?: string;
}

export function createType(
  api: ApiContext,
  projectId: string,
  dataset: string,
  body: CreateTypeBody,
): Promise<DatasetSchema> {
  return api.post<DatasetSchema>(`/v1/schema/${projectId}/${dataset}/types`, body);
}
