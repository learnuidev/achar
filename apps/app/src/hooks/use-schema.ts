'use client';

import type { DatasetSchema } from '@achar/types';
import { useResource, type Resource } from '@/hooks/use-resource';

/**
 * The schema a dataset is authored against.
 *
 * Everything the studio draws is downstream of this read: the rail's list of
 * types, the form's controls, the list's preview titles, the orderings. It is
 * fetched once per dataset and handed down rather than fetched per screen,
 * because a schema that disagrees with itself between two screens is a form
 * that saves a field the list cannot show.
 */
export function useSchema(projectId: string, dataset: string): Resource<DatasetSchema> {
  return useResource(`schema:${projectId}/${dataset}`, (client) =>
    client.getSchema(projectId, dataset),
  );
}
