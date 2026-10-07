/**
 * The schema a dataset is authored against.
 *
 * **A dataset with no schema row has no content types.** It used to answer
 * `defaultSchema()` — Achar's own marketing model, with posts and authors and
 * pricing plans in it — and that default was the wrong answer to give anybody: a
 * project somebody made a minute ago, holding somebody else's content model, with
 * forms for fields they never asked for.
 *
 * What a dataset holds is now the dataset's own decision: the studio's type
 * editor writes one, and the API stores it. See `packages/schema/src/ts`, which is
 * how one gets written — as TypeScript, or from a pasted sample of data.
 *
 * Achar's own model still exists, in `@achar/schema`'s `defaultSchema()`, and
 * still renders this repository's site. It is simply no longer what every new
 * dataset starts as.
 *
 * The stored row and the answer differ in one deliberate way: `projectId` and
 * `dataset` are the ones that were asked for, not the ones the stored schema
 * happens to name. A schema belongs to a dataset, and a client that cached one
 * under the wrong name would be reading somebody else's content model.
 */

import type { DatasetSchema, SchemaType } from '@achar/types';
import { previewOf, validateDocument, type SchemaIssue } from '@achar/schema';
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

/**
 * When a schema that has never been written was written.
 *
 * The epoch, because `updatedAt` has to be a date and there is no true one to
 * give: a studio that draws "last written" checks for an empty type list first, so
 * this value is never read as a date by anything that matters. `new Date()` here
 * would be worse — it would claim somebody had just saved it.
 */
const NEVER = new Date(0).toISOString();

/** The schema of a dataset, stored or empty. Never absent, and never somebody else's. */
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

  const types: SchemaType[] = [];
  return { projectId, dataset, types, revision: revisionOf(types), updatedAt: NEVER };
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
 * One rule and it is structural rather than editorial: a type's name has to be
 * usable as the value of a document's `_type`, and no two types may share one. A
 * schema that is merely *odd* — a required field with no title, a reference to a
 * type that does not exist, a type with no fields — is somebody's work in
 * progress, and a PUT that argued with it would be a validation screen the studio
 * already has.
 *
 * **An empty schema is allowed**, and it used to be refused. A dataset with no
 * content types is now the state every dataset starts in rather than a mistake:
 * its types are written by whoever owns it, and deleting the last one is how
 * somebody starts over. A rule against it would be a rule against the only way
 * back to an empty dataset.
 */
function assertUsableTypes(types: SchemaType[]): void {
  if (!Array.isArray(types)) {
    throw new HttpError(400, 'BAD_REQUEST', 'A schema is a list of types', { field: 'types' });
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
