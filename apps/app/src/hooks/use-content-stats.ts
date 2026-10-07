'use client';

import type { AcharDocument, SchemaType } from '@achar/types';
import { useResource, type Resource } from '@/hooks/use-resource';

/** How many documents of one type exist. */
export interface TypeCount {
  type: SchemaType;
  count: number;
}

export interface ContentStats {
  counts: TypeCount[];
  recent: AcharDocument[];
}

/**
 * The overview: how much of each type there is, and what was touched last.
 *
 * The counts are one `count(*[_type == "x"])` per type rather than a scan of
 * everything, because GROQ here has no group-by and the alternative is reading
 * every document to draw a dashboard. `query` answers a `QueryResult` — the
 * result, how long it took, how many documents it read — and a dashboard wants
 * the first of those, which is why the counts read `.result`.
 *
 * The recent list is one ordered query at `previewDrafts`, so an editor sees
 * their own unwritten work in it. A count that fails takes the dashboard down
 * rather than drawing a zero: a number this screen invented would be worse than
 * a screen that says it could not count.
 */
export function useContentStats(
  projectId: string,
  dataset: string,
  types: SchemaType[],
): Resource<ContentStats> {
  const key = `stats:${projectId}/${dataset}:${types.map((type) => type.name).join(',')}`;

  return useResource(key, async (client) => {
    const [counts, recent] = await Promise.all([
      Promise.all(
        types.map(async (type) => {
          const answer = await client.query<number>(projectId, dataset, {
            query: `count(*[_type == "${type.name}"])`,
          });
          return { type, count: typeof answer.result === 'number' ? answer.result : 0 };
        }),
      ),
      (async () => {
        const answer = await client.query<AcharDocument[]>(projectId, dataset, {
          query: '* | order(_updatedAt desc)[0...8]',
          perspective: 'previewDrafts',
          // The studio draws these rows with the same components the editor uses,
          // so they are read the way the editor reads them.
          shape: 'stored',
        });
        return Array.isArray(answer.result) ? answer.result : [];
      })(),
    ]);

    return { counts, recent };
  });
}
