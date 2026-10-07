'use client';

import { useState } from 'react';
import { FileIcon, ImageIcon, SearchIcon } from 'lucide-react';
import type { Asset } from '@achar/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  cn,
} from '@achar/ui';
import { formatBytes } from '@/lib/format';
import { useAssetLibrary } from '@/components/studio/asset-library';
import { AssetUpload } from '@/components/studio/asset-upload';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';

/**
 * Choosing something from the library, for a field that stores its reference.
 *
 * The library is not fetched here — `useAssetLibrary` already holds it, because
 * every preview beside the picker resolves its reference through the same copy.
 * That is what makes the upload at the top of this dialog work: a file finishes,
 * `remember` puts it in the library, and the grid under the drop zone has it
 * before anybody could click. An upload here does **not** choose itself, because
 * a person may be dropping three files at once and the dialog would close on the
 * first one while the other two were still in flight.
 *
 * The library is filtered rather than queried: `listAssets` filters by kind and
 * pages by token, and the filename is not something it searches at all, so the
 * search box reads what the library read answered with — which is the whole set,
 * by design, since a reference is resolved through it.
 */
export function AssetPicker({
  open,
  onOpenChange,
  onSelect,
  accept,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (asset: Asset) => void;
  accept?: 'image' | 'file';
}): React.ReactElement {
  const library = useAssetLibrary();
  const [term, setTerm] = useState('');
  const kind = accept ?? 'image';

  const needle = term.trim().toLowerCase();
  const items = library.assets
    .filter((asset) => asset.kind === kind)
    .filter((asset) => (needle ? asset.filename.toLowerCase().includes(needle) : true));

  const empty = library.assets.length === 0;

  function choose(asset: Asset) {
    onSelect(asset);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{kind === 'image' ? 'Choose an image' : 'Choose a file'}</DialogTitle>
          <DialogDescription>
            The field keeps the asset&rsquo;s reference and not its bytes, and the library resolves
            that reference to a URL on read — so any number of documents can point at one asset
            without copying anything.
          </DialogDescription>
        </DialogHeader>

        {/* No `onUploaded`: a finished upload is already in the library and at
            the top of the grid, and choosing it there is the person's call —
            three files dropped at once would otherwise close this dialog on the
            first of them. */}
        <AssetUpload accept={kind} compact />

        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search by filename"
            className="pl-8"
            aria-label="Search assets by filename"
            autoFocus
          />
        </div>

        {library.error && <ErrorNote>{library.error}</ErrorNote>}

        <div className="max-h-96 min-h-40 overflow-y-auto">
          {library.loading && library.assets.length === 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <Skeleton key={index} className="h-32 w-full rounded-xl" />
              ))}
            </div>
          ) : empty ? (
            <EmptyState
              icon={
                kind === 'image' ? <ImageIcon className="size-5" /> : <FileIcon className="size-5" />
              }
              title={kind === 'image' ? 'The library has no images yet' : 'The library is empty'}
              description="Drop a file on the strip above and it lands here immediately — upload and choose are the same dialog on purpose, because the file somebody wants is usually the one they have not uploaded yet."
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<SearchIcon className="size-5" />}
              title="Nothing matches that"
              description={
                needle
                  ? 'Search reads filenames only. A file is called whatever it was called when it was uploaded.'
                  : `This dataset's library holds no ${kind === 'image' ? 'images' : 'files'} yet.`
              }
            />
          ) : kind === 'image' ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((asset) => (
                <button
                  key={asset.assetId}
                  type="button"
                  onClick={() => choose(asset)}
                  className={cn(
                    'group overflow-hidden rounded-xl border border-border bg-card p-2 text-left transition-colors',
                    'hover:border-ring/60 hover:bg-accent/40',
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`, and the URL is already transformed. */}
                  <img
                    src={asset.url}
                    alt={asset.filename}
                    loading="lazy"
                    className="h-24 w-full rounded-lg border border-border object-cover"
                  />
                  <p className="mt-2 truncate text-xs">{asset.filename}</p>
                  <p className="truncate text-xs text-muted-foreground">{describe(asset)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {items.map((asset) => (
                <button
                  key={asset.assetId}
                  type="button"
                  onClick={() => choose(asset)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
                >
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{asset.filename}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {asset.contentType} · {formatBytes(asset.size)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** What an asset is, in the two facts that decide between two similar ones. */
function describe(asset: Asset): string {
  const dimensions = asset.width && asset.height ? `${asset.width}×${asset.height} · ` : '';
  return `${dimensions}${formatBytes(asset.size)}`;
}
