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
import { Keys, deleteItem, getItem, putItem, tryUpdateItem, type Item } from './dynamo';
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

/** How many times a one-type write is re-read and re-applied before it gives up. */
const MERGE_ATTEMPTS = 3;

/**
 * A write of one content type.
 *
 * `replaces` is what makes a rename expressible, and it is the caller's to say
 * rather than something to infer: the body carries the type as it should now be,
 * so the name it used to have is the one fact about the previous state that the
 * request cannot contain.
 *
 * **It is also the line between a create and an upsert, and that line is drawn
 * here rather than in the route's name.** Absent, the write only adds: a name the
 * schema already holds is a `TYPE_EXISTS` conflict, because a create that quietly
 * stood in for an existing content type is a create that destroys one — with one
 * typo, and no way to tell from the answer. Present, the write stands in for that
 * type where it is, or adds it when it is not there yet, which is what makes a
 * bootstrap script safe to run twice. `@achar/schema` keeps `createIfNotExists` and
 * `createOrReplace` apart for the same reason: the caller knows which it means and
 * a helper cannot guess.
 */
export interface TypeWrite {
  type: SchemaType;
  /** The name this write stands in for. Absent means "only if the name is free". */
  replaces?: string;
}

export interface TypeWriteResult {
  schema: DatasetSchema;
  /** False when a type of that name was already there and this write replaced it. */
  created: boolean;
}

/**
 * Adds or replaces one content type, without replacing the schema around it.
 *
 * The difference between this and `putDatasetSchema` is not cosmetic. A PUT carries
 * the whole `types` array, so a client adding one type has to read the schema,
 * append, and write everything back — and two of those interleaved lose one of the
 * two types, silently, because the second write is a whole-array assignment that
 * never knew about the first. The window is as long as the client's own round trip.
 *
 * So the read, the merge and the write happen here instead, and the write is
 * conditional on the revision the read saw. A concurrent write is therefore not
 * merged into but *noticed*: this re-reads and applies itself again on top of the
 * newer types. `revision` is what makes that check mean something — it is a hash of
 * the types, so "unchanged" is a fact about the content rather than a timestamp
 * that ticks on writes which changed nothing.
 *
 * Merging is also what carries the parts of a type that nothing writes yet:
 * `preview`, `orderings` and `groups` are stored, drawn by the studio, and edited
 * by no route at all. See `mergeType`.
 */
export async function addDatasetType(
  projectId: string,
  dataset: string,
  write: TypeWrite,
): Promise<TypeWriteResult> {
  const datasetKey = schemaKeyOf(projectId, dataset);

  for (let attempt = 1; attempt <= MERGE_ATTEMPTS; attempt += 1) {
    const key = Keys.schema(projectId, datasetKey);
    const row = await getItem<SchemaRecord>('SchemasTable', key);
    const types = Array.isArray(row?.types) ? row.types : [];

    // A create is a create. Without `replaces` the caller is adding a type and not
    // saying which one it stands in for, so a name that is already taken is a
    // conflict rather than an invitation to overwrite somebody's type — and it is
    // the only case where the two readings of this write differ, which is why the
    // flag is a name rather than a mode.
    if (write.replaces === undefined && types.some((candidate) => candidate.name === write.type.name)) {
      throw new HttpError(
        409,
        'TYPE_EXISTS',
        `${write.type.name} is already a content type in this dataset`,
        { type: write.type.name },
      );
    }

    // Replaced in place, so that editing a type does not move it to the end of the
    // studio's rail. A list that reorders itself every time somebody fixes a typo
    // is a list people lose their place in.
    const replacing = write.replaces ?? write.type.name;
    const index = types.findIndex((candidate) => candidate.name === replacing);
    const next =
      index === -1
        ? [...types, write.type]
        : types.map((candidate, position) =>
            position === index ? mergeType(candidate, write.type) : candidate,
          );

    // A rename onto a name another type already holds arrives here as two types
    // sharing one name, which is the one thing a schema may not be.
    assertUsableTypes(next);

    const revision = revisionOf(next);
    const updatedAt = new Date().toISOString();

    const applied = await tryUpdateItem<SchemaRecord>('SchemasTable', key, {
      set: { types: next, revision, updatedAt },
      // `attribute_not_exists` for the first write, because a schema row that has
      // never existed is not a row at revision `''`. `revision` is aliased rather
      // than written bare: it is one of DynamoDB's reserved words, and a raw one in
      // a condition expression is a syntax error rather than a lookup.
      condition: row ? '#revision = :expected' : 'attribute_not_exists(#revision)',
      names: { '#revision': 'revision' },
      ...(row ? { values: { ':expected': row.revision } } : {}),
    });

    if (applied.changed) {
      return {
        schema: { projectId, dataset, types: next, revision, updatedAt },
        created: index === -1,
      };
    }
  }

  // Three losses in a row is not a race any more, it is a schema somebody is
  // writing to continuously, and answering with the merged types would be a lie
  // about which ones landed.
  throw new HttpError(
    409,
    'CONFLICT',
    'Another write changed this schema while this one was being applied',
  );
}

/**
 * The incoming type, written over the stored one.
 *
 * The stored type is the starting point, so keys this write does not speak for
 * survive it. The keys that *are* overwritten are the six a type editor owns —
 * `name`, `title`, `kind`, `icon`, `fields`, `description` — and two of them are
 * deleted when the request leaves them out rather than kept. That asymmetry is the
 * point: a plain spread would make clearing an icon or a description impossible,
 * because "absent" and "unchanged" would be the same word.
 */
function mergeType(stored: SchemaType, incoming: SchemaType): SchemaType {
  const merged: SchemaType = {
    ...stored,
    name: incoming.name,
    title: incoming.title,
    kind: incoming.kind,
    fields: incoming.fields,
  };

  if (incoming.icon === undefined) delete merged.icon;
  else merged.icon = incoming.icon;

  if (incoming.description === undefined) delete merged.description;
  else merged.description = incoming.description;

  return merged;
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

/**
 * How a caller asked for a document to be shaped.
 *
 * - `schema` — **the default**, and what a site wants: an `image` field is an
 *   address, a reference is the document it names.
 * - `stored` — what the studio wants: an `image` field is a reference it can
 *   replace, a reference is an id it can point somewhere else.
 *
 * An unknown value is refused rather than defaulted: a caller that asked for
 * something this API does not offer has a bug, and answering with a different shape
 * than the one it asked for is how that bug becomes a rendering problem instead of
 * a 400.
 */
export type DocumentShape = 'schema' | 'stored';

export function requireDocumentShape(value: string | undefined): DocumentShape {
  if (value === undefined || value === '') return 'schema';
  if (value === 'schema' || value === 'stored') return value;
  throw new HttpError(400, 'BAD_REQUEST', 'shape must be `schema` or `stored`', { field: 'shape' });
}

/** The type a document names, or `undefined` when the schema has never heard of it. */
export function documentType(schema: DatasetSchema, name: string): SchemaType | undefined {
  return schema.types.find((type) => type.name === name && type.kind !== 'object');
}

/**
 * Checks a document that is being written against its type.
 *
 * A document of a type the schema does not declare is refused, because a
 * document nothing can render is not content — it is a row that will appear in
 * no list and no query a client can write. The fields are checked by the schema
 * package, which is the same code the studio's form runs, so the two cannot
 * disagree about what is wrong.
 *
 * **`requireComplete` is the caller's, and it is the draft/publish line.** A
 * draft may be missing a required field — that is what a draft is for — so the
 * write path passes `false` and publishing passes `true`. Shapes are checked
 * either way: a number where the schema says string is a mistake in a draft too.
 */
export function assertValidDocument(
  schema: DatasetSchema,
  document: Record<string, unknown>,
  options: { requireComplete?: boolean } = {},
): void {
  const name = typeof document._type === 'string' ? document._type : '';
  const type = documentType(schema, name);
  if (!type) {
    throw new HttpError(400, 'UNKNOWN_TYPE', `${name || 'That document'} is not a type in this schema`, {
      type: name,
      types: schema.types.map((entry) => entry.name),
    });
  }

  const issues: SchemaIssue[] = validateDocument(type, document, options);
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
