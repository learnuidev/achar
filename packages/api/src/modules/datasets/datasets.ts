import type { Dataset, DatasetExport, DatasetVisibility } from '@achar/types';

import type { ApiContext } from '../../lib/context';

/** A new dataset inside a project. Private unless it says otherwise. */
export interface CreateDatasetBody {
  datasetName: string;
  visibility?: DatasetVisibility;
}

/** The one thing about a dataset that is editable after it exists. */
export interface UpdateDatasetBody {
  visibility: DatasetVisibility;
}

export function listDatasets(api: ApiContext, projectId: string): Promise<Dataset[]> {
  return api.get<Dataset[]>(`/v1/projects/${projectId}/datasets`);
}

export function createDataset(
  api: ApiContext,
  projectId: string,
  body: CreateDatasetBody,
): Promise<Dataset> {
  return api.post<Dataset>(`/v1/projects/${projectId}/datasets`, body);
}

export function getDataset(
  api: ApiContext,
  projectId: string,
  dataset: string,
): Promise<Dataset> {
  return api.get<Dataset>(`/v1/projects/${projectId}/datasets/${dataset}`);
}

export function updateDataset(
  api: ApiContext,
  projectId: string,
  dataset: string,
  body: UpdateDatasetBody,
): Promise<Dataset> {
  return api.patch<Dataset>(`/v1/projects/${projectId}/datasets/${dataset}`, body);
}

/** Deletes the dataset and every document and asset in it. */
export function deleteDataset(
  api: ApiContext,
  projectId: string,
  dataset: string,
): Promise<void> {
  return api.del<void>(`/v1/projects/${projectId}/datasets/${dataset}`);
}

/** The whole dataset — schema, documents and asset rows — as one portable object. */
export function exportDataset(
  api: ApiContext,
  projectId: string,
  dataset: string,
): Promise<DatasetExport> {
  return api.get<DatasetExport>(`/v1/projects/${projectId}/datasets/${dataset}/export`);
}
