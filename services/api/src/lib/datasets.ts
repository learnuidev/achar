/**
 * Datasets — a content store inside a project.
 *
 * The row is small and almost entirely bookkeeping: the name is the range key,
 * the visibility is what a public read token is checked against, and the counts
 * are what the studio's sidebar draws without counting anything. The counts live
 * here rather than being derived because deriving them means reading a dataset's
 * documents to draw a number beside its name.
 *
 * Counts move by `ADD` and only after the conditional write that justifies them
 * has succeeded, so a lost counter is one that missed a change rather than one
 * that double-counted it — and `ADD` treats a missing attribute as zero, which
 * is why a dataset written before a counter existed still counts correctly.
 */

import type { Dataset, DatasetVisibility } from '@achar/types';
import {
  Keys,
  deleteItem,
  getItem,
  putIfAbsent,
  queryAll,
  updateItem,
  type Item,
} from './dynamo';
import { HttpError } from './http';
import { deleteAssetsOfProject } from './assets';
import { deleteRowsOfDataset } from './documents';
import { deleteSchema } from './schemas';

export interface DatasetRecord extends Item {
  projectId: string;
  datasetName: string;
  visibility: DatasetVisibility;
  documentCount: number;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
  lastMutationAt?: string | null;
}

export function toDataset(record: DatasetRecord): Dataset {
  return {
    projectId: record.projectId,
    datasetName: record.datasetName,
    visibility: record.visibility,
    documentCount: record.documentCount ?? 0,
    assetCount: record.assetCount ?? 0,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    lastMutationAt: record.lastMutationAt ?? null,
  };
}

/**
 * The dataset name, which is also its URL segment.
 *
 * Constrained rather than sanitized: a name is chosen once and then appears in
 * every query, every reference and every exported file, so a name that had to be
 * escaped to travel would be a name that arrives somewhere slightly different
 * from where it was written.
 */
export function requireDatasetName(value: string): string {
  const name = value.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) {
    throw new HttpError(
      400,
      'BAD_REQUEST',
      'A dataset name must start with a letter or digit and hold only lowercase letters, digits, `_` and `-`',
      { field: 'dataset' },
    );
  }
  return name;
}

export async function getDataset(
  projectId: string,
  datasetName: string,
): Promise<DatasetRecord | undefined> {
  return getItem<DatasetRecord>('DatasetsTable', Keys.dataset(projectId, datasetName));
}

export async function listDatasets(projectId: string): Promise<DatasetRecord[]> {
  return queryAll<DatasetRecord>('DatasetsTable', {
    keyCondition: '#projectId = :projectId',
    names: { '#projectId': 'projectId' },
    values: { ':projectId': projectId },
  });
}

export async function listDatasetNames(projectId: string): Promise<string[]> {
  return (await listDatasets(projectId)).map((record) => record.datasetName);
}

export interface CreateDatasetInput {
  projectId: string;
  datasetName: string;
  visibility: DatasetVisibility;
}

export async function createDataset(input: CreateDatasetInput): Promise<DatasetRecord> {
  const now = new Date().toISOString();
  const record: DatasetRecord = {
    projectId: input.projectId,
    datasetName: input.datasetName,
    visibility: input.visibility,
    documentCount: 0,
    assetCount: 0,
    createdAt: now,
    updatedAt: now,
    lastMutationAt: null,
  };

  const written = await putIfAbsent('DatasetsTable', record as unknown as Item, 'datasetName');
  if (!written) {
    throw new HttpError(409, 'DATASET_EXISTS', `Dataset ${input.datasetName} already exists`, {
      dataset: input.datasetName,
    });
  }

  await updateItem('ProjectsTable', Keys.project(input.projectId), { inc: { datasetCount: 1 } });
  return record;
}

export async function updateDataset(
  projectId: string,
  datasetName: string,
  patch: { visibility?: DatasetVisibility },
): Promise<DatasetRecord> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.visibility !== undefined) set.visibility = patch.visibility;

  const updated = await updateItem<DatasetRecord>(
    'DatasetsTable',
    Keys.dataset(projectId, datasetName),
    {
      set,
      condition: 'attribute_exists(#key)',
      names: { '#key': 'datasetName' },
      returnValues: 'ALL_NEW',
    },
  );
  if (!updated) throw new HttpError(404, 'DATASET_NOT_FOUND', 'Dataset not found');
  return updated;
}

/**
 * Moves a dataset's counters, as one write.
 *
 * `documents` is a delta and `mutated` says whether this write is content
 * changing — a read does not touch `lastMutationAt`, and a counter that moved on
 * a read would make "last changed" mean "last looked at".
 */
export async function recordDatasetChange(
  projectId: string,
  datasetName: string,
  change: { documents?: number; assets?: number; mutated?: boolean },
): Promise<void> {
  const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (change.mutated) set.lastMutationAt = new Date().toISOString();

  await updateItem('DatasetsTable', Keys.dataset(projectId, datasetName), {
    set,
    ...(change.documents ? { inc: { documentCount: change.documents } } : {}),
    ...(change.assets ? { inc: { assetCount: change.assets } } : {}),
  });
}

/** Removes the dataset row itself. What changed is the caller's to report. */
export async function deleteDatasetRow(projectId: string, datasetName: string): Promise<boolean> {
  const removed = await deleteItem('DatasetsTable', Keys.dataset(projectId, datasetName), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'datasetName' },
  });
  return removed.deleted;
}

export interface DatasetCascadeCounts {
  documents: number;
  assets: number;
  schemas: number;
}

/**
 * Deletes a dataset and everything in it, children first.
 *
 * Documents before assets before the row: each of those is reached through this
 * dataset's name, so removing the row first would leave content that the API can
 * no longer address and nobody can delete through it.
 */
export async function deleteDataset(
  projectId: string,
  datasetName: string,
): Promise<DatasetCascadeCounts> {
  const documents = await deleteRowsOfDataset(projectId, datasetName);
  const schemas = (await deleteSchema(projectId, datasetName)) ? 1 : 0;
  const assets = await deleteAssetsOfProject(projectId, datasetName);

  const removed = await deleteDatasetRow(projectId, datasetName);
  if (!removed) {
    throw new HttpError(404, 'DATASET_NOT_FOUND', 'Dataset not found', { dataset: datasetName });
  }

  await updateItem('ProjectsTable', Keys.project(projectId), { inc: { datasetCount: -1 } });
  return { documents, assets, schemas };
}
