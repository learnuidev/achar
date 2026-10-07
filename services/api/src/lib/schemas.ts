/**
 * The schema a dataset is authored against.
 *
 * A dataset that has never had one stored is not a dataset without a schema: the
 * API answers `defaultSchema()`, which is Achar's own content model. That
 * defaulting is the reason this file exists rather than a `getItem` in a
 * handler — a studio opened on a brand new dataset has to draw something, and
 * "nothing is authored here yet" is not something a form can render.
 *
 * The stored row and the answer differ in one deliberate way: `projectId` and
 * `dataset` are the ones that were asked for, not the ones the default schema
 * happens to name. A schema belongs to a dataset, and a client that cached one
 * under the wrong name would be reading Achar's content model from somebody
 * else's dataset.
 */

import type { DatasetSchema, SchemaType } from '@achar/types';
import { defaultSchema, previewOf, validateDocument, type SchemaIssue } from '@achar/schema';
import { createHash } from 'node:crypto';
import { Keys, deleteItem, getItem, putItem, type Item } from './dynamo';
import { HttpError } from './http';

export interface SchemaRecord extends Item {
  projectId: string;
  /** `{projectId}#{dataset}` — the range key, and the same packing documents use. */
  datasetKey: string;
  types: SchemaType[];
  revision: string;
  updatedAt: string;
}

export function schemaKeyOf(projectId: string, dataset: string): string {
  return `${projectId}#${dataset}`;
}

/** The schema of a dataset, stored or defaulted. Never absent. */
export async function getDatasetSchema(
  projectId: string,
  dataset: string,
): Promise<DatasetSchema> {
  const row = await getItem<SchemaRecord>(
    'SchemasTable',
    Keys.schema(projectId, schemaKeyOf(projectId, dataset)),
  );

  if (row) {
    return {
      projectId,
      dataset,
      types: row.types,
      revision: row.revision,
      updatedAt: row.updatedAt,
    };
  }

  const fallback = defaultSchema();
  return {
    projectId,
    dataset,
    types: fallback.types,
    revision: fallback.revision,
    updatedAt: fallback.updatedAt,
  };
}

/**
 * Replaces a dataset's schema.
 *
 * The revision is a hash of the types rather than a timestamp, so that two
 * editors who save the same types arrive at one revision and a client can tell
 * "this is the schema I was drawn against" from "somebody saved a no-op".
 */
export async function putDatasetSchema(
  projectId: string,
  dataset: string,
  types: SchemaType[],
): Promise<DatasetSchema> {
  assertUsableTypes(types);

  const now = new Date().toISOString();
  const record: SchemaRecord = {
    projectId,
    datasetKey: schemaKeyOf(projectId, dataset),
    types,
    revision: revisionOf(types),
    updatedAt: now,
  };

  await putItem('SchemasTable', record as unknown as Item);
  return { projectId, dataset, types, revision: record.revision, updatedAt: now };
}

export async function deleteSchema(projectId: string, dataset: string): Promise<boolean> {
  const removed = await deleteItem('SchemasTable', Keys.schema(projectId, schemaKeyOf(projectId, dataset)), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'datasetKey' },
  });
  return removed.deleted;
}

/**
 * A revision that changes when the types change and not otherwise.
 *
 * A timestamp would fail that second half — two deployments of one schema would
 * carry two revisions and every client would think it was stale — so this is a
 * hash over the canonically ordered JSON. It is written here rather than taken
 * from `@achar/schema`'s own hashing because that function is not part of the
 * package's public surface, and a revision is only ever compared: any stable
 * function of the types is a correct answer, and a client never mixes two.
 */
function revisionOf(types: SchemaType[]): string {
  return createHash('sha256').update(canonical(types), 'utf8').digest('hex').slice(0, 32);
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
}

/**
 * Refuses a schema that could not be authored against.
 *
 * Two rules only, and both of them are structural rather than editorial: names
 * have to be usable as keys in a document, and no two types may share one. A
 * schema that is merely *odd* — a required field with no title, a reference to a
 * type that does not exist — is somebody's work in progress, and a PUT that
 * argued with it would be a validation screen the studio already has.
 */
function assertUsableTypes(types: SchemaType[]): void {
  if (!Array.isArray(types) || types.length === 0) {
    throw new HttpError(400, 'BAD_REQUEST', 'A schema must declare at least one type', {
      field: 'types',
    });
  }

  const seen = new Set<string>();
  for (const type of types) {
    if (typeof type?.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(type.name)) {
      throw new HttpError(400, 'BAD_REQUEST', 'A type name must be an identifier', {
        field: 'types',
      });
    }
    if (seen.has(type.name)) {
      throw new HttpError(400, 'BAD_REQUEST', `Two types are named ${type.name}`, {
        field: 'types',
      });
    }
    seen.add(type.name);
  }
}

/** The type a document names, or `undefined` when the schema has never heard of it. */
export function documentType(schema: DatasetSchema, name: string): SchemaType | undefined {
  return schema.types.find((type) => type.name === name && type.kind !== 'object');
}

/**
 * Checks a document that is being written whole against its type.
 *
 * A document of a type the schema does not declare is refused, because a
 * document nothing can render is not content — it is a row that will appear in
 * no list and no query a client can write. The fields are checked by the schema
 * package, which is the same code the studio's form runs, so the two cannot
 * disagree about what is missing.
 */
export function assertValidDocument(schema: DatasetSchema, document: Record<string, unknown>): void {
  const name = typeof document._type === 'string' ? document._type : '';
  const type = documentType(schema, name);
  if (!type) {
    throw new HttpError(400, 'UNKNOWN_TYPE', `${name || 'That document'} is not a type in this schema`, {
      type: name,
      types: schema.types.map((entry) => entry.name),
    });
  }

  const issues: SchemaIssue[] = validateDocument(type, document);
  if (issues.length > 0) {
    throw new HttpError(400, 'VALIDATION_FAILED', `${type.title} is not valid`, { issues });
  }
}

/** The type's own preview, bound to one type — what a list calls a document. */
export function previewFor(
  schema: DatasetSchema,
  typeName: string,
): (document: Record<string, unknown>) => { title: string; subtitle?: string; mediaField?: string } {
  const type = documentType(schema, typeName);
  if (!type) {
    return (document) => ({ title: typeof document._id === 'string' ? document._id : '' });
  }
  return (document) => previewOf(type, document);
}
