'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Asset } from '@achar/types';
import { useAssets } from '@/hooks/use-assets';

/**
 * The dataset's assets, once, for everything that draws one.
 *
 * An asset is referenced by a string — `image-<assetId>-1200x800-jpg` — and a
 * URL is not in it. So every screen that shows an image needs the library
 * beside it: the file field's preview, the rich text editor's embedded images,
 * the reader-facing preview pane, and the library itself. Fetching it per
 * screen would mean four reads of the same list and four chances to disagree
 * about an asset that was uploaded a second ago.
 *
 * Uploads and deletions are applied to the local copy as well as the server's,
 * because the picker closes onto a preview that has to be there immediately —
 * a refetch round-trip would draw a broken image for a file the person just
 * chose. `refresh` stays for the cases where the server is the only truth.
 */
export interface AssetLibrary {
  assets: Asset[];
  loading: boolean;
  error: string | null;
  assetFor: (reference: string | null | undefined) => Asset | null;
  urlFor: (reference: string | null | undefined) => string | null;
  /** Note an asset the studio just uploaded, before the next read of the list. */
  remember: (asset: Asset) => void;
  forget: (assetId: string) => void;
  refresh: () => void;
}

const AssetLibraryContext = createContext<AssetLibrary | null>(null);

export function AssetLibraryProvider({
  projectId,
  dataset,
  children,
}: {
  projectId: string;
  dataset: string;
  children: ReactNode;
}) {
  const { data, loading, error, refresh } = useAssets(projectId, dataset);
  const [added, setAdded] = useState<Asset[]>([]);
  const [removed, setRemoved] = useState<string[]>([]);

  const assets = useMemo(() => {
    const fetched = data ?? [];
    const gone = new Set(removed);
    const known = new Set(fetched.map((asset) => asset.assetId));
    return [...added.filter((asset) => !known.has(asset.assetId) && !gone.has(asset.assetId)), ...fetched].filter(
      (asset) => !gone.has(asset.assetId),
    );
  }, [data, added, removed]);

  const byReference = useMemo(() => {
    const map = new Map<string, Asset>();
    for (const asset of assets) {
      map.set(asset.reference, asset);
      // A reference is `image-<assetId>-<w>x<h>-<ext>`; the id alone is enough
      // to find the asset, which is what saves a reference written by an older
      // upload with different dimensions from resolving to nothing.
      map.set(asset.assetId, asset);
    }
    return map;
  }, [assets]);

  const assetFor = useCallback(
    (reference: string | null | undefined): Asset | null => {
      if (!reference) return null;
      const direct = byReference.get(reference);
      if (direct) return direct;
      const bare = reference.replace(/^(image|video|file)-/, '').split('-')[0];
      return (bare && byReference.get(bare)) || null;
    },
    [byReference],
  );

  const urlFor = useCallback(
    (reference: string | null | undefined): string | null => assetFor(reference)?.url ?? null,
    [assetFor],
  );

  const remember = useCallback((asset: Asset) => {
    setAdded((current) => [asset, ...current.filter((item) => item.assetId !== asset.assetId)]);
  }, []);

  const forget = useCallback((assetId: string) => {
    setRemoved((current) => [...current, assetId]);
  }, []);

  const value = useMemo<AssetLibrary>(
    () => ({ assets, loading, error, assetFor, urlFor, remember, forget, refresh }),
    [assets, loading, error, assetFor, urlFor, remember, forget, refresh],
  );

  return <AssetLibraryContext.Provider value={value}>{children}</AssetLibraryContext.Provider>;
}

/**
 * The library, or an empty one.
 *
 * A missing provider is not an error: the portable text renderer is written to
 * take its value and nothing else, so that it can be dropped anywhere — a test,
 * a different frame — and an unresolved image has to draw as something rather
 * than throw.
 */
const NO_LIBRARY: AssetLibrary = {
  assets: [],
  loading: false,
  error: null,
  assetFor: () => null,
  urlFor: () => null,
  remember: () => undefined,
  forget: () => undefined,
  refresh: () => undefined,
};

export function useAssetLibrary(): AssetLibrary {
  return useContext(AssetLibraryContext) ?? NO_LIBRARY;
}
