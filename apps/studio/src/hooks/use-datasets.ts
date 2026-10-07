'use client';

import type { Dataset } from '@achar/types';
import { asList } from '@/lib/api-shapes';
import { useResource, type Resource } from '@/hooks/use-resource';

/** A project's datasets — `production`, `staging`, and whatever else it keeps. */
export function useDatasets(projectId: string): Resource<Dataset[]> {
  return useResource(`datasets:${projectId}`, async (client) =>
    asList<Dataset>(await client.listDatasets(projectId)),
  );
}

/** One dataset, for the studio shell's header and its counts. */
export function useDataset(projectId: string, dataset: string): Resource<Dataset> {
  return useResource(`dataset:${projectId}/${dataset}`, (client) =>
    client.getDataset(projectId, dataset),
  );
}
