'use client';

import type { AcharDocument, Perspective, SchemaType } from '@achar/types';
import { errorMessage } from '@/lib/errors';
import { useAcharClient } from '@/components/studio/client-provider';
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

async function countOf(
  client: ReturnType<typeof useAcharClient>,
  projectId: string,
  dataset: string,
  type: string,
): Promise<number> {
  const answer = await client.query<unknown>(dataset, { query: `count(*[_type == "${type}"])` }, projectId);
  return typeof answer === 'number' ? answer : 0;
}

/**
 * The overview: how much of each type there is, and what was touched last.
 *
 * The counts are one `count(*[_type == "x"])` per type rather than a scan of
 * everything, because GROQ here has no group-by and the alternative is reading
 * every document to draw a dashboard. The recent list is a single ordered
 * query, at `previewDrafts`, so an editor sees their own unsaved work in it.
 *
 * A type whose count fails is not a page that fails: the dashboard is a
 * convenience, and it draws what it could count. The one honest exception is
 * every query failing, which the caller reads as an error through `error`.
 */
export function useContentStats(
  projectId: string,
  dataset: string,
  types: SchemaType[],
): Resource<ContentStats> {
  const client = useAcharClient();
  const key = `stats:${projectId}/${dataset}:${types.map((type) => type.name).join(',')}`;

  return useResource(key, async () => {
    const [counts, recent] = await Promise.all([
      Promise.all(
        types.map(async (type) => ({
          type,
          count: await countOf(client, projectId, dataset, type.name),
        })),
      ),
      (async () => {
        const perspective: Perspective = 'previewDrafts';
        const answer = await client.query<unknown>(
          dataset,
          { query: '* | order(_updatedAt desc)[0...8]', perspective },
          projectId,
        );
        return Array.isArray(answer) ? (answer as AcharDocument[]) : [];
      })(),
    ]);

    return { counts, recent };
  });
}

/** The error text of a failed count, for a panel that draws its own message. */
export function statsError(error: unknown): string {
  return errorMessage(error, 'Could not count documents');
}
