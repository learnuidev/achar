import type { Dataset, DatasetExport, DatasetVisibility } from '@achar/types';

import type { ApiContext } from '../../lib/context';

/** A new dataset inside a project. Private unless it says otherwise, and English. */
export interface CreateDatasetBody {
  datasetName: string;
  visibility?: DatasetVisibility;
  /** The languages to start with. Omitted means English alone. */
  languages?: string[];
  defaultLanguage?: string;
}

/**
 * What is editable about a dataset after it exists.
 *
 * A language is added here, and the list arrives whole: two clients each adding one
 * would otherwise both be writing "the list, plus mine" and one of them would lose.
 * Removing a language does not delete the content written in it — it stops being
 * readable until the language comes back.
 */
export interface UpdateDatasetBody {
  visibility?: DatasetVisibility;
  languages?: string[];
  defaultLanguage?: string;
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
