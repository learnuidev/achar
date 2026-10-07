/**
 * Documents, and the draft/publish pair the whole model rests on.
 *
 * A document is two rows that share one id: the draft is the row whose
 * `documentKey` ends in `drafts.<id>`, the published one is the row whose key
 * ends in `<id>`. They are rows rather than one row with a flag because that is
 * what lets an editor change a draft for a week while the site keeps serving
 * what was published — and because publishing is then a copy of one row onto the
 * other rather than a state machine every reader has to be trusted to get right.
 *
 * Every row carries `_id` **unprefixed** as a plain attribute as well as inside
 * its `documentKey`. The key holds the prefixed id, because one `begins_with`
 * read of a dataset depends on it; the attribute holds the unprefixed id,
 * because that is what a document *is* to everybody outside this file — what a
 * reference, a URL and a Studio screen name it by. A row that carried only the
 * prefixed form would leak `drafts.` into every client that echoed an id back.
 *
 * `documentKey` is the only key attribute, and `_rev` is a value on the row
 * rather than part of its identity: a revision inside the key would make every
 * save an insert, leaving the previous revision behind in a table that then has
 * to be read to find out which version is current.
 *
 * Every row also carries `datasetKey` and `typeKey`, which are the hash keys of
 * the two indexes this module reads through. An index only sees the items that
 * carry its key attributes, so those two fields are part of what a row *is*, not
 * a detail of how it was written.
 */

import type {
  AcharDocument,
  DatasetSchema,
  DocumentMutation,
  DocumentSummary,
  MutationResponse,
  MutationResult,
  Perspective,
  ProjectRole,
  SchemaField,
  SchemaType,
} from '@achar/types';
import {
  Keys,
  cancelledIndexes,
  countQuery,
  deleteAction,
  deleteItem,
  getItem,
  isConditionalCheckFailed,
  isTransactionCanceled,
  putAction,
  putItem,
  query,
  transactWrite,
  type Item,
  type Key,
} from './dynamo';
import { coalesceSpans, referenceIdOf, shapeDocument } from '@achar/schema';
import {
  assetIdFromReference,
  assetUrlsForReferences,
  collectAssetReferences,
  withAssetUrls,
} from './assets';
import { documentType } from './schemas';
import { HttpError } from './http';
import { rev as newRev, ulid } from './ids';
import { forgetVersions, getVersion, snapshotVersion, type SnapshotInput } from './versions';

export const DRAFT_PREFIX = 'drafts.';

export function isDraftId(id: string): boolean {
  return id.startsWith(DRAFT_PREFIX);
}

/** The id a document is known by outside this file. */
export function publishedIdOf(id: string): string {
  return isDraftId(id) ? id.slice(DRAFT_PREFIX.length) : id;
}

export function draftIdOf(id: string): string {
  return isDraftId(id) ? id : `${DRAFT_PREFIX}${id}`;
}

/** `{projectId}#{dataset}` — the hash key of `UpdatedIndex`. */
export function datasetKeyOf(projectId: string, dataset: string): string {
  return `${projectId}#${dataset}`;
}

/**
 * `{projectId}#{dataset}#{_type}` — the hash key of `TypeIndex`.
 *
 * Composed into one attribute because an index has exactly one hash key. The
 * alternative — hashing `datasetKey` and ranging `_type` — cannot also be ranged
 * by `_updatedAt`, and "the newest ten posts" is the query a studio list makes.
 */
export function typeKeyOf(projectId: string, dataset: string, type: string): string {
  return `${projectId}#${dataset}#${type}`;
}

/** `{projectId}#{dataset}#{id}`, where `{id}` is whichever id the row holds. */
export function documentKeyOf(projectId: string, dataset: string, id: string): string {
  return `${projectId}#${dataset}#${id}`;
}

export interface DocumentRow extends Item {
  documentKey: string;
  /** `{projectId}#{dataset}` — carried so `UpdatedIndex` can see the item. */
  datasetKey: string;
  /** `{projectId}#{dataset}#{_type}` — carried so `TypeIndex` can see the item. */
  typeKey: string;
  _id: string;
  _type: string;
  _rev: string;
  _createdAt: string;
  _updatedAt: string;
  draft: boolean;
}

/** Attributes of a row that are ours, and that a content field may never shadow. */
const INTERNAL_ATTRIBUTES = new Set([
  'documentKey',
  'datasetKey',
  'typeKey',
  'draft',
  '_rev',
  '_createdAt',
  '_updatedAt',
]);

/**
 * Refuses a field this file would later have to shadow.
 *
 * A document's fields are whatever its schema says, with one exception: a name
 * beginning `_` belongs to the system, and a write carrying one would be stored
 * and then overwritten on the way out by the value the system owns — a field
 * that reads back as something other than what was written. Refusing it at the
 * write says so while the caller can still fix it.
 */
export function assertWritableFields(fields: Record<string, unknown>): void {
  for (const name of Object.keys(fields)) {
    const reserved = INTERNAL_ATTRIBUTES.has(name) || (name.startsWith('_') && name !== '_id' && name !== '_type');
    if (reserved) {
      throw new HttpError(400, 'BAD_REQUEST', `A field may not be named ${name}`, { field: name });
    }
  }
}

/**
 * A stored row as the API returns it, with the bookkeeping attributes removed.
 *
 * **A field that is portable text is answered in its canonical form** — adjacent
 * spans with the same marks joined into one — which is the shape the schema
 * describes and the one a person can read. It is done here rather than in the
 * handler because this is the single place a document becomes an answer, so a query,
 * a read by id and a webhook payload all agree; and it is done *on the way out*
 * because documents written before the studio's editor stopped splitting runs are
 * already in the table, and a reader should not have to care which.
 */
export function toApiDocument(
  row: DocumentRow,
  flags: { draft: boolean; published: boolean; editable: boolean },
): AcharDocument {
  const document: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(row)) {
    if (INTERNAL_ATTRIBUTES.has(name)) continue;
    document[name] = coalesceSpans(value);
  }
  return {
    ...document,
    _draft: flags.draft,
    _published: flags.published,
    _editable: flags.editable,
  } as AcharDocument;
}

export interface DocumentRows {
  draft?: DocumentRow;
  published?: DocumentRow;
}

/**
 * Both rows of one document.
 *
 * Two reads of two derived keys, in parallel — no query and no index. This is
 * what the `documentKey` packing buys: every read of a document is a `GetItem`
 * on a key that can be computed rather than a query that has to be planned.
 */
export async function readRows(
  projectId: string,
  dataset: string,
  id: string,
): Promise<DocumentRows> {
  const bare = publishedIdOf(id);
  const [draft, published] = await Promise.all([
    getItem<DocumentRow>(
      'DocumentsTable',
      Keys.document(documentKeyOf(projectId, dataset, draftIdOf(bare))),
    ),
    getItem<DocumentRow>('DocumentsTable', Keys.document(documentKeyOf(projectId, dataset, bare))),
  ]);
  return { ...(draft ? { draft } : {}), ...(published ? { published } : {}) };
}

/**
 * A perspective read out of a query string.
 *
 * The fallback is the caller's, never this function's: a route that reads for a
 * site passes `published`, because the one thing a perspective default must
 * never do is hand a draft to something that did not ask for one.
 */
export function requirePerspective(value: string | undefined, fallback: Perspective): Perspective {
  if (!value) return fallback;
  if (value === 'raw' || value === 'published' || value === 'previewDrafts') return value;
  throw new HttpError(400, 'BAD_REQUEST', `perspective must be one of raw, published, previewDrafts`, {
    field: 'perspective',
  });
}

export interface ResolvedDocument {
  row: DocumentRow;
  /** The row returned is the draft row. */
  draft: boolean;
  /** A published row exists beside it. */
  published: boolean;
}

/**
 * Which row a perspective means.
 *
 * | perspective | both rows | only a draft | only published |
 * | `raw` | published | draft | published |
 * | `previewDrafts` | draft | draft | published |
 * | `published` | published | omitted | published |
 *
 * `raw` and `published` differ in exactly one place, and it is the one that
 * matters: a site asking for `published` must never be handed a draft, while a
 * caller asking for `raw` — the studio, an export, this API's own reads — wants
 * whatever exists rather than nothing at all.
 */
export function resolveRows(
  rows: DocumentRows,
  perspective: Perspective,
): ResolvedDocument | undefined {
  const { draft, published } = rows;

  if (draft && published) {
    if (perspective === 'previewDrafts') return { row: draft, draft: true, published: true };
    return { row: published, draft: false, published: true };
  }

  if (draft) {
    // The one cell of the table that is neither row: a caller asking for what is
    // published, of a document that has never been published, is asking for
    // something that does not exist. Handing back the draft here is how a draft
    // ends up on a public site.
    if (perspective === 'published') return undefined;
    return { row: draft, draft: true, published: false };
  }
  if (published) return { row: published, draft: false, published: true };
  return undefined;
}

/**
 * A document as the type that declares it: addresses for assets, documents for
 * references.
 *
 * This is the delivery shape, and it is the difference between what the studio
 * reads and what a site reads. The studio edits *documents* — an image field is a
 * reference it can replace, an author is an id it can point somewhere else — while a
 * site renders a *type*, where `coverImage` is an address and `author` is an author.
 * Both are honest answers to different questions, which is why the shape is
 * something a caller asks for rather than something this API decides for them.
 *
 * References resolve **one level**, read through `getDocument` at the perspective
 * the caller asked for: the document's own references become documents whose assets
 * are addresses and whose own references stay references. A page of posts that
 * resolved its authors' posts would be a page of everything.
 */
export async function shapeForDelivery(
  projectId: string,
  dataset: string,
  schema: DatasetSchema,
  document: Record<string, unknown>,
  perspective: Perspective,
): Promise<Record<string, unknown>> {
  const type = documentType(schema, typeof document._type === 'string' ? document._type : '');
  // Not a type this dataset declares: nothing to shape it by, and a schema is not a
  // filter — the document is answered as it stands.
  if (!type) return document;

  const entities = new Map<string, { type: SchemaType; document: Record<string, unknown> }>();
  for (const id of collectReferenceIds(type, document)) {
    const found = await getDocument(projectId, dataset, id, perspective, false);
    if (!found) continue;
    const entityType = documentType(schema, typeof found._type === 'string' ? found._type : '');
    if (entityType) entities.set(id, { type: entityType, document: found });
  }

  // One asset pass for the document *and* for everything it resolved to, so a page
  // of posts illustrated with six covers costs six reads rather than one per field.
  const references = [
    ...collectAssetReferences(document),
    ...[...entities.values()].flatMap((entity) => collectAssetReferences(entity.document)),
  ];
  const urls = await assetUrlsForReferences(projectId, dataset, references);
  const assetUrl = (reference: string): string | undefined => {
    const id = assetIdFromReference(reference);
    return id ? urls.get(id) : undefined;
  };

  // The entities first, each shaped with assets and **no** reference resolver: that
  // absent resolver is what makes the depth of this exactly one level.
  const shaped = new Map<string, unknown>();
  for (const [id, entity] of entities) {
    shaped.set(id, shapeDocument(entity.type, entity.document, { assetUrl }));
  }

  return shapeDocument(type, document, { assetUrl, reference: (id) => shaped.get(id) });
}

/** The ids a document's reference fields name, at any depth in its declared shapes. */
function collectReferenceIds(type: SchemaType, document: Record<string, unknown>): string[] {
  const found: string[] = [];
  walkDeclaredFields(type.fields, document, (field, value) => {
    if (field.type !== 'reference') return;
    const id = referenceIdOf(value);
    if (id) found.push(id);
  });
  return [...new Set(found)];
}

/** Every value the type declares a field for, following objects and lists of them. */
function walkDeclaredFields(
  fields: SchemaField[],
  value: unknown,
  visit: (field: SchemaField, value: unknown) => void,
): void {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
  const declared = new Map(fields.map((field) => [field.name, field]));

  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    const field = declared.get(name);
    if (!field) continue;
    visit(field, entry);

    if (field.type === 'object') walkDeclaredFields(field.fields ?? [], entry, visit);

    if (field.type === 'array' && Array.isArray(entry)) {
      const item = (field.of ?? [])[0];
      if (item?.type === 'object') {
        for (const member of entry) walkDeclaredFields(item.fields ?? [], member, visit);
      }
    }
  }
}

/**
 * One document, with the CDN address of every asset it holds.
 *
 * An image or a video field comes back as its reference **and** a `url`, resolved
 * here rather than left to the caller: this is the one place every single-document
 * read goes through — a read by id, a `->` dereference inside a query, and the
 * payload a webhook delivers — so all three carry the same address and none of
 * them needs a second request to draw a picture.
 */
export async function getDocument(
  projectId: string,
  dataset: string,
  id: string,
  perspective: Perspective,
  editable: boolean,
): Promise<AcharDocument | undefined> {
  const resolved = resolveRows(await readRows(projectId, dataset, id), perspective);
  if (!resolved) return undefined;

  const document = toApiDocument(resolved.row, {
    draft: resolved.draft,
    published: resolved.published,
    editable,
  });
  return withAssetUrls(projectId, dataset, document);
}

/** Whether a caller of this role may change a document, which is what `_editable` says. */
export function editableFor(role: ProjectRole): boolean {
  return role === 'ADMIN' || role === 'EDITOR';
}

export interface RowPageInput {
  projectId: string;
  dataset: string;
  /** Pins `TypeIndex` when the caller knows the type, as a studio list does. */
  type?: string;
  limit: number;
  /** Oldest first, for the one case that asks for it. Newest first otherwise. */
  ascending?: boolean;
  exclusiveStartKey?: Key;
}

export interface RowPage {
  rows: DocumentRow[];
  lastEvaluatedKey?: Key;
}

/**
 * A page of rows, in the order an index holds them.
 *
 * `typeKey` when the type is known and `datasetKey` otherwise — both are the
 * hash key of an index that exists for exactly this, and both are ranged by
 * `_updatedAt`, so the page arrives in the order a list draws it and no scan is
 * involved.
 */
export async function pageRows(input: RowPageInput): Promise<RowPage> {
  const page = await query<DocumentRow>('DocumentsTable', {
    index: input.type ? 'TypeIndex' : 'UpdatedIndex',
    keyCondition: '#key = :key',
    names: { '#key': input.type ? 'typeKey' : 'datasetKey' },
    values: {
      ':key': input.type
        ? typeKeyOf(input.projectId, input.dataset, input.type)
        : datasetKeyOf(input.projectId, input.dataset),
    },
    limit: input.limit,
    // `_updatedAt` as a range key means newest-first is the index read backwards,
    // which is the whole reason the attribute is an ISO string: it sorts as time.
    scanIndexForward: input.ascending === true,
    ...(input.exclusiveStartKey ? { exclusiveStartKey: input.exclusiveStartKey } : {}),
  });

  return {
    rows: page.items,
    ...(page.lastEvaluatedKey ? { lastEvaluatedKey: page.lastEvaluatedKey } : {}),
  };
}

export interface ResolvedRow {
  id: string;
  row: DocumentRow;
  /** The row returned is the draft row. */
  draft: boolean;
  /** A published row exists. */
  published: boolean;
  /** A draft row exists, whichever row was returned. */
  hasDraft: boolean;
}

/**
 * A page of rows at one perspective, collapsed to one entry per document.
 *
 * Both rows of a document are in the same index, so a page of twenty rows is
 * between ten and twenty documents — and when both are on the page the pair is
 * already known. Only the half that is missing costs a read, which is what
 * makes a list of published content one extra `GetItem` per row and a studio
 * list of drafted content none at all.
 */
export async function resolvePageRows(
  projectId: string,
  dataset: string,
  rows: DocumentRow[],
  perspective: Perspective,
): Promise<ResolvedRow[]> {
  const grouped = new Map<string, DocumentRows>();
  for (const row of rows) {
    const entry = grouped.get(row._id) ?? {};
    if (row.draft) entry.draft = row;
    else entry.published = row;
    grouped.set(row._id, entry);
  }

  const resolved: ResolvedRow[] = [];
  for (const [id, entry] of grouped) {
    const rows = { ...entry };
    if (!rows.draft || !rows.published) {
      const both = await readRows(projectId, dataset, id);
      rows.draft ??= both.draft;
      rows.published ??= both.published;
    }

    const where = resolveRows(rows, perspective);
    if (!where) continue;
    resolved.push({
      id,
      row: where.row,
      draft: where.draft,
      published: where.published,
      hasDraft: rows.draft !== undefined,
    });
  }

  return resolved;
}

/** The same page as API documents. */
export async function resolvePage(
  projectId: string,
  dataset: string,
  rows: DocumentRow[],
  perspective: Perspective,
  editable: boolean,
): Promise<AcharDocument[]> {
  const resolved = await resolvePageRows(projectId, dataset, rows, perspective);
  return resolved.map((entry) =>
    toApiDocument(entry.row, {
      draft: entry.draft,
      published: entry.published,
      editable,
    }),
  );
}

/**
 * What a list shows about a document without reading all of it.
 *
 * `title`, `subtitle` and the media URL come from the schema's `preview`, which
 * is the one place a type says which of its fields name it in a list — so the
 * caller passes the shaping function in rather than a field name this file would
 * have to guess at.
 */
export function toSummary(
  row: DocumentRow,
  flags: { hasDraft: boolean; published: boolean },
  preview: (document: AcharDocument) => {
    title: string;
    subtitle?: string | null;
    mediaUrl?: string | null;
  },
): DocumentSummary {
  const document = toApiDocument(row, {
    draft: row.draft,
    published: flags.published,
    editable: false,
  });
  const shaped = preview(document);
  return {
    _id: row._id,
    _type: row._type,
    _rev: row._rev,
    _createdAt: row._createdAt,
    _updatedAt: row._updatedAt,
    hasDraft: flags.hasDraft,
    published: flags.published,
    title: shaped.title,
    subtitle: shaped.subtitle ?? null,
    mediaUrl: shaped.mediaUrl ?? null,
  };
}

/** How many rows a dataset — or one type in it — holds. */
export async function countRows(projectId: string, dataset: string, type?: string): Promise<number> {
  return countQuery('DocumentsTable', {
    index: type ? 'TypeIndex' : 'UpdatedIndex',
    keyCondition: '#key = :key',
    names: { '#key': type ? 'typeKey' : 'datasetKey' },
    values: {
      ':key': type ? typeKeyOf(projectId, dataset, type) : datasetKeyOf(projectId, dataset),
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Writes
// ─────────────────────────────────────────────────────────────────────────────

interface RowSeed {
  projectId: string;
  dataset: string;
  /** The unprefixed id. */
  id: string;
  draft: boolean;
  fields: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

function buildRow(seed: RowSeed): DocumentRow {
  // `_draft`, `_published` and `_editable` are what a *read* answers with rather
  // than what a row holds, so a document that came out of a read carries them —
  // and a restored version is exactly that, since a snapshot is the document as a
  // client saw it. Passing them on would store a draft row claiming to be
  // published, which nothing reads today and which nothing should have to know.
  const {
    _id: _ignoredId,
    _type: ignoredType,
    _draft: _ignoredDraft,
    _published: _ignoredPublished,
    _editable: _ignoredEditable,
    ...fields
  } = seed.fields;
  const type = typeof ignoredType === 'string' ? ignoredType : '';
  if (!type) throw new HttpError(400, 'BAD_REQUEST', '_type is required', { field: '_type' });

  const id = seed.draft ? draftIdOf(seed.id) : publishedIdOf(seed.id);
  const at = seed.updatedAt ?? new Date().toISOString();

  // The internal attributes come after the spread, so a body that happens to
  // carry `draft` or `_rev` cannot disagree with what this row actually is.
  return {
    ...fields,
    documentKey: documentKeyOf(seed.projectId, seed.dataset, id),
    datasetKey: datasetKeyOf(seed.projectId, seed.dataset),
    typeKey: typeKeyOf(seed.projectId, seed.dataset, type),
    _id: seed.id,
    _type: type,
    _rev: newRev(),
    _createdAt: seed.createdAt ?? at,
    _updatedAt: at,
    draft: seed.draft,
  };
}

function conflict(message: string, documentId: string): HttpError {
  return new HttpError(409, 'DOCUMENT_EXISTS', message, { documentId });
}

function missing(documentId: string): HttpError {
  return new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document ${documentId} not found`, { documentId });
}

export interface MutationContext {
  projectId: string;
  dataset: string;
  /**
   * Who is publishing, for the version a publish leaves behind.
   *
   * Optional because a mutation is not always a person — a seed, a script — and a
   * version that does not know who wrote it is still a version. Absent rather than
   * invented: a `publishedBy` of `'unknown'` would be a name nothing can resolve.
   */
  publishedBy?: string | null;
  /**
   * Runs over a document that is being written whole, with the stage it is being
   * written at. A patch is exempt — see `applyPatch` — because refusing an edit to
   * one field over a schema complaint about another would make an old document
   * uneditable.
   *
   * The stage is not decoration: a **draft** may be missing a required field, and a
   * **published** document may not. That is the whole difference between the two
   * rows, and the reason this is a parameter rather than a flag on the context —
   * the same batch can publish one document and draft another.
   */
  validate?: (document: AcharDocument, stage: 'draft' | 'published') => void;
}

export interface MutationInput extends MutationContext {
  mutations: DocumentMutation[];
  /** Fail the whole batch rather than applying what can be applied. */
  atomic: boolean;
}

/**
 * What a batch did, including two counts the contract has no room for.
 *
 * `created` and `deleted` are what moves a dataset's `documentCount`, and only
 * this function knows whether a `createOrReplace` created anything: it is the
 * one holding the row as it was. Counting them from `results` in the caller
 * would be counting operations rather than documents, and a replace is not a
 * creation.
 */
export interface MutationsApplied extends MutationResponse {
  created: number;
  deleted: number;
}

/**
 * The batch's working state.
 *
 * `rows` is what the document looks like now, `original` is what the table had
 * when this batch first looked, and `dirty` names the keys that have to be
 * written. Keeping the two apart is what lets the emit step tell a create from
 * an update without either of them having to say so: a key with a row and no
 * original is new, and its write carries `attribute_not_exists`.
 */
interface Working {
  rows: Map<string, DocumentRow | undefined>;
  original: Map<string, DocumentRow | undefined>;
  dirty: Set<string>;
}

function emptyWorking(): Working {
  return { rows: new Map(), original: new Map(), dirty: new Set() };
}

function keyOf(projectId: string, dataset: string, draft: boolean, id: string): string {
  return documentKeyOf(projectId, dataset, draft ? draftIdOf(id) : publishedIdOf(id));
}

async function currentRows(
  context: MutationContext,
  working: Working,
  id: string,
): Promise<DocumentRows> {
  const bare = publishedIdOf(id);
  const draftKey = keyOf(context.projectId, context.dataset, true, bare);
  const publishedKey = keyOf(context.projectId, context.dataset, false, bare);

  if (!working.rows.has(draftKey) && !working.rows.has(publishedKey)) {
    const rows = await readRows(context.projectId, context.dataset, bare);
    for (const [key, row] of [
      [draftKey, rows.draft],
      [publishedKey, rows.published],
    ] as const) {
      working.rows.set(key, row);
      working.original.set(key, row);
    }
  }

  const draft = working.rows.get(draftKey);
  const published = working.rows.get(publishedKey);
  return { ...(draft ? { draft } : {}), ...(published ? { published } : {}) };
}

function stage(working: Working, row: DocumentRow): void {
  working.rows.set(row.documentKey, row);
  working.dirty.add(row.documentKey);
}

function clear(working: Working, key: string): void {
  working.rows.set(key, undefined);
  working.dirty.add(key);
}

/**
 * Applies an ordered batch of mutations.
 *
 * The batch is folded over a working copy of every row it touches — mutations
 * are read in order and applied to the copy, and the writes are emitted at the
 * end. For `atomic` that is a requirement rather than an optimization: DynamoDB
 * refuses a transaction that names the same item twice, and `create` followed by
 * `patch` of one document is the most ordinary batch there is.
 *
 * A non-atomic batch stops at the first failure and reports what did land in the
 * error's details. Carrying on past a failed element would leave the caller with
 * a `results` array that does not line up with the mutations they sent, which is
 * worse than stopping.
 */
export async function applyMutations(input: MutationInput): Promise<MutationsApplied> {
  const transactionId = ulid();
  const working = emptyWorking();
  const results: MutationResult[] = [];
  let created = 0;
  let deleted = 0;

  const effects: Effect[] = [];

  try {
    for (const mutation of input.mutations) {
      const applied = await applyOne(mutation, input, working);
      results.push(applied.result);
      if (applied.created) created += 1;
      if (applied.deleted) deleted += 1;
      if (applied.effects) effects.push(...applied.effects);
      if (!input.atomic) {
        await emit(working, transactionId);
        await settle(input, effects.splice(0));
      }
    }
  } catch (error) {
    if (error instanceof HttpError && !input.atomic) {
      throw new HttpError(error.status, error.code, error.message, {
        ...error.details,
        applied: results,
      });
    }
    throw error;
  }

  if (input.atomic) await emit(working, transactionId);
  await settle(input, effects);

  return { results, transactionId, created, deleted };
}

/**
 * The writes that follow the rows: versions recorded, and history dropped.
 *
 * Failures here are raised, not swallowed — a publish whose version could not be
 * written has to be knowable, and the next publish will number itself from
 * whatever history exists, so a gap is a gap rather than a corruption.
 */
async function settle(context: MutationContext, effects: Effect[]): Promise<void> {
  for (const effect of effects) {
    if (effect.kind === 'snapshot') {
      await snapshotVersion({
        projectId: context.projectId,
        dataset: context.dataset,
        documentId: effect.documentId,
        document: effect.document,
        publishedBy: context.publishedBy ?? null,
      } satisfies SnapshotInput);
      continue;
    }
    await forgetVersions(context.projectId, context.dataset, effect.documentId);
  }
}

interface Applied {
  result: MutationResult;
  /** A document that did not exist before this mutation. */
  created?: boolean;
  /** A document that exists no more. */
  deleted?: boolean;
  /**
   * What has to be written elsewhere once the rows themselves have landed.
   *
   * History lives in its own table, so it cannot be part of the same write, and
   * the order is deliberate: the document is written first and the note about it
   * second. A crash in between loses the record of a publish, which is smaller
   * than a publish that did not happen because its history could not be written.
   */
  effects?: Effect[];
}

/** A write that follows the rows: a version recorded, or a deleted document's history dropped. */
type Effect =
  | { kind: 'snapshot'; documentId: string; document: AcharDocument }
  | { kind: 'forget'; documentId: string };

async function applyOne(
  mutation: DocumentMutation,
  context: MutationContext,
  working: Working,
): Promise<Applied> {
  if (mutation.create) {
    const body = mutation.create;
    const id = publishedIdOf(body._id ?? ulid());
    assertWritableFields(body as Record<string, unknown>);

    const rows = await currentRows(context, working, id);
    if (rows.draft || rows.published) throw conflict(`Document ${id} already exists`, id);

    const row = buildRow({ ...context, id, draft: true, fields: body as Record<string, unknown> });
    context.validate?.(toApiDocument(row, { draft: true, published: false, editable: true }), 'draft');
    stage(working, row);
    return { result: { documentId: id, operation: 'create', rev: row._rev }, created: true };
  }

  if (mutation.createOrReplace) {
    const body = mutation.createOrReplace;
    const id = publishedIdOf(body._id);
    assertWritableFields(body as Record<string, unknown>);

    const rows = await currentRows(context, working, id);
    const row = buildRow({
      ...context,
      id,
      draft: true,
      fields: body as Record<string, unknown>,
      // A replacement keeps when the document first existed. Not a detail: it is
      // what a studio sorts by and what it draws as "created".
      createdAt: rows.draft?._createdAt ?? rows.published?._createdAt,
    });
    context.validate?.(toApiDocument(row, { draft: true, published: false, editable: true }), 'draft');
    stage(working, row);
    return {
      result: { documentId: id, operation: 'replace', rev: row._rev },
      created: !rows.draft && !rows.published,
    };
  }

  if (mutation.createIfNotExists) {
    const body = mutation.createIfNotExists;
    const id = publishedIdOf(body._id);
    assertWritableFields(body as Record<string, unknown>);

    const rows = await currentRows(context, working, id);
    if (rows.draft) {
      // No write at all: reporting the revision that is already there is the
      // whole of what "if not exists" promises, and a no-op write would be a
      // revision bump nobody asked for.
      return { result: { documentId: id, operation: 'create', rev: rows.draft._rev } };
    }

    const row = buildRow({
      ...context,
      id,
      draft: true,
      fields: body as Record<string, unknown>,
      createdAt: rows.published?._createdAt,
    });
    context.validate?.(toApiDocument(row, { draft: true, published: false, editable: true }), 'draft');
    stage(working, row);
    return { result: { documentId: id, operation: 'create', rev: row._rev }, created: true };
  }

  if (mutation.patch) {
    const patch = mutation.patch;
    const id = publishedIdOf(patch.id);
    const rows = await currentRows(context, working, id);
    const base = rows.draft ?? rows.published;
    if (!base) throw missing(id);

    assertWritableFields({
      ...(patch.set ?? {}),
      ...(patch.setIfMissing ?? {}),
      ...Object.fromEntries((patch.unset ?? []).map((path) => [path.split('.')[0], true])),
    });

    const row = applyPatch(base, patch, context, id);
    stage(working, row);
    return { result: { documentId: id, operation: 'patch', rev: row._rev } };
  }

  if (mutation.delete) {
    const id = publishedIdOf(mutation.delete.id);
    const rows = await currentRows(context, working, id);
    const removed = rows.draft ?? rows.published;
    if (!removed) throw missing(id);

    // Both keys are marked, so the emit removes both rows in one transaction:
    // a failure part-way would otherwise leave a document that is published but
    // has a draft, or half-deleted in a way no screen can explain.
    clear(working, keyOf(context.projectId, context.dataset, true, id));
    clear(working, keyOf(context.projectId, context.dataset, false, id));
    return {
      result: { documentId: id, operation: 'delete', rev: removed._rev },
      deleted: true,
      // A snapshot of a document that no longer exists is a version nothing can
      // be restored into, so the history goes with the document.
      effects: [{ kind: 'forget', documentId: id }],
    };
  }

  if (mutation.publish) {
    const id = publishedIdOf(mutation.publish.id);
    const rows = await currentRows(context, working, id);
    if (!rows.draft) {
      throw new HttpError(409, 'NOTHING_TO_PUBLISH', `Document ${id} has no draft to publish`, {
        documentId: id,
      });
    }

    const published = buildRow({
      ...context,
      id,
      draft: false,
      fields: rows.draft as unknown as Record<string, unknown>,
      createdAt: rows.published?._createdAt ?? rows.draft._createdAt,
    });
    // The one write where a document has to be whole: this is the row readers get.
    context.validate?.(
      toApiDocument(published, { draft: false, published: true, editable: true }),
      'published',
    );

    stage(working, published);
    clear(working, keyOf(context.projectId, context.dataset, true, id));
    return {
      result: { documentId: id, operation: 'publish', rev: published._rev },
      effects: [
        {
          kind: 'snapshot',
          documentId: id,
          document: toApiDocument(published, { draft: false, published: true, editable: true }),
        },
      ],
    };
  }

  if (mutation.unpublish) {
    const id = publishedIdOf(mutation.unpublish.id);
    const rows = await currentRows(context, working, id);
    if (!rows.published) throw missing(id);

    let draft = rows.draft;
    if (!draft) {
      // Never lose content: unpublishing a document that has no draft leaves the
      // published row's content behind as the draft, rather than deleting the
      // only copy of it and calling the result "unpublished".
      draft = buildRow({
        ...context,
        id,
        draft: true,
        fields: rows.published as unknown as Record<string, unknown>,
        createdAt: rows.published._createdAt,
      });
      stage(working, draft);
    }

    clear(working, keyOf(context.projectId, context.dataset, false, id));
    return { result: { documentId: id, operation: 'unpublish', rev: rows.published._rev } };
  }

  if (mutation.restore) {
    const id = publishedIdOf(mutation.restore.id);
    const version = await getVersion(context.projectId, context.dataset, id, mutation.restore.version);
    if (!version) {
      throw new HttpError(
        404,
        'VERSION_NOT_FOUND',
        `Document ${id} has no version ${mutation.restore.version}`,
        { documentId: id, version: mutation.restore.version },
      );
    }

    const rows = await currentRows(context, working, id);
    const row = buildRow({
      ...context,
      id,
      draft: true,
      // A snapshot is a document, so it can be handed back to `buildRow` as the
      // fields of a row — which is what keeps a restore on the same path as every
      // other write: one validator, one revision, one conflict rule. The internal
      // attributes the snapshot also carries are dropped or overwritten there.
      fields: version.document as Record<string, unknown>,
      // The document was created when it was created; a version is not a new one.
      createdAt: rows.draft?._createdAt ?? rows.published?._createdAt ?? version.document._createdAt,
    });

    context.validate?.(toApiDocument(row, { draft: true, published: false, editable: true }), 'draft');
    stage(working, row);

    // Into the draft, never onto the published row: what a site serves is what
    // somebody chose to publish, and reading a version must not be a way to change
    // production. `publish` is the next step, and it is the one that changes it.
    return {
      result: { documentId: id, operation: 'restore', rev: row._rev },
      created: !rows.draft && !rows.published,
    };
  }

  throw new HttpError(
    400,
    'BAD_REQUEST',
    'A mutation must name exactly one of create, createOrReplace, createIfNotExists, patch, delete, publish, unpublish or restore',
  );
}

/**
 * The patch, applied to the row in memory rather than in an `UpdateExpression`.
 *
 * This is what lets an atomic batch fold several mutations over one document
 * before any of them is written — DynamoDB will not take two writes to one item.
 * The trade is that two clients patching one document at the same moment resolve
 * last-write-wins rather than field-by-field, which is a conflict a client
 * notices by comparing `_rev`, and which a content editor hits about never.
 */
function applyPatch(
  base: DocumentRow,
  patch: NonNullable<DocumentMutation['patch']>,
  context: MutationContext,
  id: string,
): DocumentRow {
  const next: DocumentRow = {
    ...base,
    documentKey: keyOf(context.projectId, context.dataset, true, id),
    datasetKey: datasetKeyOf(context.projectId, context.dataset),
    draft: true,
    _id: id,
    _rev: newRev(),
    _updatedAt: new Date().toISOString(),
  };

  for (const [path, value] of Object.entries(patch.setIfMissing ?? {})) {
    if (readPath(next, path) === undefined) writePath(next, path, value);
  }
  for (const [path, amount] of Object.entries(patch.inc ?? {})) {
    const currentValue = readPath(next, path);
    writePath(next, path, (typeof currentValue === 'number' ? currentValue : 0) + amount);
  }
  // Unsets run before sets, so a patch that clears a field and writes it in one
  // element lands on the written value rather than deleting it again.
  for (const path of patch.unset ?? []) writePath(next, path, undefined);
  for (const [path, value] of Object.entries(patch.set ?? {})) writePath(next, path, value);

  const type = typeof next._type === 'string' ? next._type : '';
  if (!type) throw new HttpError(400, 'BAD_REQUEST', '_type is required', { field: '_type' });
  next.typeKey = typeKeyOf(context.projectId, context.dataset, type);

  return next;
}

function readPath(row: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = row;
  for (const segment of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null) return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function writePath(row: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor: Record<string, unknown> = row;

  for (const segment of segments.slice(0, -1)) {
    const nested = cursor[segment];
    if (typeof nested !== 'object' || nested === null) {
      if (value === undefined) return;
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }

  const last = segments[segments.length - 1];
  if (value === undefined) delete cursor[last];
  else cursor[last] = value;
}

const KEY_CONDITION = { names: { '#key': 'documentKey' } } as const;

/**
 * Writes what the batch produced.
 *
 * One key goes out as an ordinary conditional write and several go out as one
 * transaction, because the transaction is what makes a publish atomic — but a
 * single-item transaction costs twice a plain write for no additional promise.
 * Every condition is derived from the state the batch first read: an update
 * expects the row to be there, a create expects it not to be.
 */
async function emit(working: Working, clientRequestToken: string): Promise<void> {
  if (working.dirty.size === 0) return;
  const keys = [...working.dirty];
  working.dirty.clear();

  const actions = keys
    .map((key) => ({ key, row: working.rows.get(key), was: working.original.get(key) }))
    .filter((entry) => entry.row !== undefined || entry.was !== undefined);

  // What was just written is what the next mutation in the batch will find, so
  // the expected state moves with it. Without this a non-atomic `create` then
  // `patch` would carry `attribute_not_exists` onto the second write and collide
  // with the row the first one had just made.
  for (const key of keys) working.original.set(key, working.rows.get(key));

  if (actions.length === 0) return;

  if (actions.length === 1) {
    const [action] = actions;
    if (action.row) {
      await putItem('DocumentsTable', action.row as unknown as Item, {
        ...(action.was === undefined ? { condition: 'attribute_not_exists(#key)', ...KEY_CONDITION } : {}),
      }).catch((error: unknown) => {
        if (isConditionalCheckFailed(error)) throw conflicted(action.key);
        throw error;
      });
    } else {
      const removed = await deleteItem('DocumentsTable', Keys.document(action.key), {
        condition: 'attribute_exists(#key)',
        ...KEY_CONDITION,
      });
      if (!removed.deleted) throw conflicted(action.key);
    }
    return;
  }

  const items = actions.map((action) =>
    action.row
      ? putAction(
          'DocumentsTable',
          action.row as unknown as Item,
          action.was === undefined
            ? { condition: 'attribute_not_exists(#key)', ...KEY_CONDITION }
            : {},
        )
      : deleteAction('DocumentsTable', Keys.document(action.key), {
          condition: 'attribute_exists(#key)',
          ...KEY_CONDITION,
        }),
  );

  try {
    await transactWrite(items, { clientRequestToken });
  } catch (error) {
    if (isTransactionCanceled(error)) {
      const indexes = cancelledIndexes(error);
      throw new HttpError(409, 'CONFLICT', 'A document changed while this batch was being applied', {
        ...(indexes.length > 0 ? { documentKeys: indexes.map((index) => actions[index].key) } : {}),
      });
    }
    throw error;
  }
}

function conflicted(documentKey: string): HttpError {
  return new HttpError(409, 'CONFLICT', 'The document changed while this write was being prepared', {
    documentId: publishedIdOf(documentKey.split('#').slice(2).join('#')),
  });
}

/** Every row of one dataset, as the export writes them. */
export async function listAllRows(projectId: string, dataset: string): Promise<DocumentRow[]> {
  const rows: DocumentRow[] = [];
  let startKey: Key | undefined;

  for (;;) {
    const page = await query<DocumentRow>('DocumentsTable', {
      index: 'UpdatedIndex',
      keyCondition: '#key = :key',
      names: { '#key': 'datasetKey' },
      values: { ':key': datasetKeyOf(projectId, dataset) },
      ...(startKey ? { exclusiveStartKey: startKey } : {}),
    });
    rows.push(...page.items);
    if (!page.lastEvaluatedKey) return rows;
    startKey = page.lastEvaluatedKey;
  }
}

/** Removes every row of a dataset — the cascade, where a transaction is not possible. */
export async function deleteRowsOfDataset(projectId: string, dataset: string): Promise<number> {
  const rows = await listAllRows(projectId, dataset);
  let removed = 0;
  for (const row of rows) {
    const result = await deleteItem('DocumentsTable', Keys.document(row.documentKey));
    if (result.deleted) removed += 1;
  }
  return removed;
}
