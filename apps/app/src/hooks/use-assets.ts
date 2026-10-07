'use client';

import type { Asset, AssetKind } from '@achar/types';
import { asList } from '@/lib/api-shapes';
import { useResource, type Resource } from '@/hooks/use-resource';

/**
 * A dataset's asset library.
 *
 * Read as a whole rather than paged, deliberately: the library is drawn as a
 * grid of images and every reference in every document resolves through it, so
 * the studio wants the set, not its first fifty. A library large enough for
 * that to hurt is a library that wants a search box, which is a different
 * screen and a different read.
 */
export function useAssets(
  projectId: string,
  dataset: string,
  options: { kind?: AssetKind } = {},
): Resource<Asset[]> {
  const kind = options.kind ?? '';
  return useResource(`assets:${projectId}/${dataset}:${kind}`, async (client) =>
    asList<Asset>(
      await client.listAssets(projectId, dataset, {
        ...(kind ? { kind: kind as AssetKind } : {}),
      }),
    ),
  );
}
