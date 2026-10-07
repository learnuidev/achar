/**
 * Version history: what a document said, every time it was published.
 *
 * A version is written once and never changed — that is the whole of the table's
 * design, and the IAM says so: `VersionsTable` is granted `PutItem`, `GetItem`,
 * `Query` and `DeleteItem` and **no `UpdateItem`**, so a version cannot be edited
 * by a handler even by mistake. A history somebody can rewrite is not a history.
 *
 * A row is keyed by the dataset and by `{documentId}#v{version}`. The dataset is
 * the hash key rather than the document, because that is the granularity a cascade
 * removes at — deleting a dataset takes its versions in one query — and the
 * document is the range key's prefix, so "the versions of this document" is the
 * same query narrowed by `begins_with`.
 *
 * **`_rev` is not the key, and this is why the table exists.** A document's row
 * carries the revision it currently is, and publishing replaces it; the previous
 * revision is gone. So `v1`, `v2` are counted here, per document, and the count is
 * read from these rows rather than kept on the document — a counter on the
 * document would be lost by an unpublish, and the next publish would then reuse a
 * number that is already history.
 */

import type { AcharDocument, DocumentVersion, DocumentVersionSummary } from '@achar/types';
import {
  Keys,
  deleteItem,
  getItem,
  isConditionalCheckFailed,
  putItem,
  queryAll,
  type Item,
} from './dynamo';
import { HttpError } from './http';

export interface VersionRow extends Item {
  /** `{projectId}#{dataset}` — the hash key. */
  datasetKey: string;
  /** `{documentId}#v{version}` — the range key. */
  versionKey: string;
  documentId: string;
  version: number;
  publishedAt: string;
  publishedBy?: string | null;
  rev: string;
  /** The document as it was, exactly as a client would have read it then. */
  document: AcharDocument;
}

export function versionKeyOf(documentId: string, version: number): string {
  return `${documentId}#v${version}`;
}

/** How many times a version write may lose a race before it gives up and says so. */
const WRITE_ATTEMPTS = 3;

export interface SnapshotInput {
  projectId: string;
  dataset: string;
  documentId: string;
  /** The document as it stands after the publish — the published row, as a client sees it. */
  document: AcharDocument;
  publishedBy?: string | null;
}

/**
 * Records what was just published, and answers with the version it became.
 *
 * Written *after* the publish has landed, deliberately: a version is the record of
 * something that happened rather than a condition on it happening. A crash in
 * between loses the note that this publish occurred, which is a smaller loss than
 * a publish refused because history could not be written.
 *
 * The number is `max(existing) + 1` rather than a counter on the document, and the
 * write is conditional on that number not existing yet — two editors publishing
 * the same document at the same moment would otherwise both compute `v3` and one
 * would overwrite the other's snapshot. Losing that race costs one retry.
 */
export async function snapshotVersion(input: SnapshotInput): Promise<DocumentVersion> {
  const publishedAt = new Date().toISOString();

  for (let attempt = 0; attempt < WRITE_ATTEMPTS; attempt += 1) {
    const version = (await latestVersion(input.projectId, input.dataset, input.documentId)) + 1;

    const row: VersionRow = {
      datasetKey: datasetKeyOf(input.projectId, input.dataset),
      versionKey: versionKeyOf(input.documentId, version),
      documentId: input.documentId,
      version,
      publishedAt,
      publishedBy: input.publishedBy ?? null,
      rev: input.document._rev,
      document: input.document,
    };

    try {
      await putItem('VersionsTable', row as unknown as Item, {
        condition: 'attribute_not_exists(#key)',
        names: { '#key': 'versionKey' },
      });
      return toVersion(row);
    } catch (error) {
      if (!isConditionalCheckFailed(error)) throw error;
      // Somebody published the same document a moment ago and took this number.
      // The next pass reads the history again and picks the one after it.
    }
  }

  throw new HttpError(409, 'CONFLICT', 'This document was published while its version was being written');
}

/** Every version of one document, newest first — what a history panel draws. */
export async function listVersions(
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<DocumentVersionSummary[]> {
  const rows = await queryAll<VersionRow>('VersionsTable', {
    keyCondition: '#datasetKey = :datasetKey AND begins_with(#versionKey, :prefix)',
    names: { '#datasetKey': 'datasetKey', '#versionKey': 'versionKey' },
    values: {
      ':datasetKey': datasetKeyOf(projectId, dataset),
      ':prefix': `${documentId}#v`,
    },
  });

  return rows
    .map(toSummary)
    .sort((a, b) => b.version - a.version);
}

/** One version, with the document it holds. */
export async function getVersion(
  projectId: string,
  dataset: string,
  documentId: string,
  version: number,
): Promise<DocumentVersion | undefined> {
  const row = await getItem<VersionRow>(
    'VersionsTable',
    Keys.version(datasetKeyOf(projectId, dataset), versionKeyOf(documentId, version)),
  );
  return row ? toVersion(row) : undefined;
}

/**
 * Forgets what a deleted document was.
 *
 * Called when a document is deleted, and it is a choice rather than a
 * consequence: a version whose document is gone is a snapshot nothing can be
 * restored *into*, so keeping it would be keeping a row nothing reads. Deleting a
 * whole dataset or project takes them the same way, one level up.
 */
export async function forgetVersions(
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<number> {
  const rows = await queryAll<VersionRow>('VersionsTable', {
    keyCondition: '#datasetKey = :datasetKey AND begins_with(#versionKey, :prefix)',
    names: { '#datasetKey': 'datasetKey', '#versionKey': 'versionKey' },
    values: { ':datasetKey': datasetKeyOf(projectId, dataset), ':prefix': `${documentId}#v` },
  });

  let removed = 0;
  for (const row of rows) {
    const result = await deleteItem('VersionsTable', {
      datasetKey: row.datasetKey,
      versionKey: row.versionKey,
    });
    if (result.deleted) removed += 1;
  }
  return removed;
}

/** Every version in a dataset — what a dataset's own cascade removes. */
export async function forgetVersionsOfDataset(projectId: string, dataset: string): Promise<number> {
  const rows = await queryAll<VersionRow>('VersionsTable', {
    keyCondition: '#datasetKey = :datasetKey',
    names: { '#datasetKey': 'datasetKey' },
    values: { ':datasetKey': datasetKeyOf(projectId, dataset) },
  });

  let removed = 0;
  for (const row of rows) {
    const result = await deleteItem('VersionsTable', {
      datasetKey: row.datasetKey,
      versionKey: row.versionKey,
    });
    if (result.deleted) removed += 1;
  }
  return removed;
}

function datasetKeyOf(projectId: string, dataset: string): string {
  return `${projectId}#${dataset}`;
}

/** The highest number this document has reached, or 0 when it has never been published. */
async function latestVersion(
  projectId: string,
  dataset: string,
  documentId: string,
): Promise<number> {
  const summaries = await listVersions(projectId, dataset, documentId);
  return summaries.reduce((highest, entry) => Math.max(highest, entry.version), 0);
}

function toSummary(row: VersionRow): DocumentVersionSummary {
  return {
    documentId: row.documentId,
    version: row.version,
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy ?? null,
    rev: row.rev,
  };
}

function toVersion(row: VersionRow): DocumentVersion {
  return { ...toSummary(row), document: row.document };
}
