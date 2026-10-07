'use client';

import { use, useState } from 'react';
import {
  ExternalLinkIcon,
  FileIcon,
  ImageIcon,
  SearchIcon,
  Trash2Icon,
  VideoIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Asset } from '@achar/types';
import {
  Card,
  CardContent,
  Input,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@achar/ui';
import { useAssetLibrary } from '@/components/studio/asset-library';
import { AssetUpload } from '@/components/studio/asset-upload';
import { useAcharClient } from '@/components/client-provider';
import { useStudio } from '@/components/studio/studio-context';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-row';
import { EmptyState, ErrorNote, ReadOnlyNote } from '@/components/ui/empty-state';
import { PageHeader, StatBlock } from '@/components/ui/page-header';
import { errorMessage } from '@/lib/errors';
import { formatBytes, plural, relativeTime } from '@/lib/format';

/**
 * The library: every image, video and file the dataset holds.
 *
 * A document never carries the bytes of an asset, only a reference to a row in
 * here, and every preview in the studio resolves that reference through this same
 * list — which is why the page is drawn from `useAssetLibrary` rather than from a
 * read of its own. An upload made here is in the grid before the next read of the
 * library, and an asset deleted here is gone from every document preview at the
 * same moment.
 *
 * Deleting is the one action on this screen that reaches into documents: the row
 * and the object go, and the references that pointed at them stay written down,
 * drawing as a placeholder. So it is asked about plainly and named for what it
 * does, rather than offered as an icon with a tooltip.
 */
export default function AssetsPage({
  params,
}: {
  params: Promise<{ projectId: string; dataset: string }>;
}) {
  const { projectId, dataset } = use(params);
  const { canEdit } = useStudio();
  const library = useAssetLibrary();
  const client = useAcharClient();

  const [term, setTerm] = useState('');
  const [deleting, setDeleting] = useState<Asset | null>(null);
  const [pending, setPending] = useState(false);

  const images = library.assets.filter((asset) => asset.kind === 'image');
  const videos = library.assets.filter((asset) => asset.kind === 'video');
  const files = library.assets.filter((asset) => asset.kind === 'file');
  const bytes = library.assets.reduce((sum, asset) => sum + asset.size, 0);

  const needle = term.trim().toLowerCase();
  const shown = (assets: Asset[]) =>
    needle ? assets.filter((asset) => asset.filename.toLowerCase().includes(needle)) : assets;

  async function remove() {
    if (!deleting) return;
    setPending(true);
    try {
      await client.deleteAsset(projectId, dataset, deleting.assetId);
      // Applied to the copy in hand rather than refetched: the grid behind this
      // dialog has to lose the tile in the same frame the confirmation lands,
      // and a read that came back a second later would redraw the asset that was
      // just deleted.
      library.forget(deleting.assetId);
      toast.success(`${deleting.filename} deleted`);
      setDeleting(null);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={<span className="font-mono">{dataset}</span>}
        title="Asset library"
        description={
          <>
            Every image, video and file this dataset holds. A document stores a reference, never the bytes,
            and this library is what resolves that reference to a URL — so what is here is what every
            preview, and every reader of the published content, is drawn from.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatBlock label="Images" value={images.length} hint="drawn as a grid" />
        <StatBlock label="Videos" value={videos.length} hint="played in place" />
        <StatBlock label="Files" value={files.length} hint="drawn as a list" />
        <StatBlock label="Total size" value={formatBytes(bytes)} hint="of the stored objects" />
      </div>

      {library.error && <ErrorNote>{library.error}</ErrorNote>}

      {canEdit ? (
        <AssetUpload accept="all" />
      ) : (
        <ReadOnlyNote>
          You are a viewer on this project, so the library is here to read: no uploads, and no
          deletes. Every URL on this page can still be copied and opened.
        </ReadOnlyNote>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search the library by filename"
            className="pl-8"
            aria-label="Search assets by filename"
          />
        </div>
        {needle && (
          <p className="text-xs text-muted-foreground">
            {plural(shown(library.assets).length, 'match', 'matches')}
          </p>
        )}
      </div>

      {library.loading && library.assets.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-48 w-full rounded-2xl" />
          ))}
        </div>
      ) : library.assets.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="size-5" />}
          title="The library is empty"
          description={
            canEdit
              ? 'Drop a file on the surface above, or pick one — images and files both land here, and a document can point at either the moment it exists.'
              : 'Nobody has uploaded anything to this dataset yet, and you are a viewer on this project, so an editor is who adds the first file.'
          }
        />
      ) : (
        <Tabs defaultValue="images">
          <TabsList>
            <TabsTrigger value="images">
              <ImageIcon className="size-4" />
              Images
              <span className="text-muted-foreground tabular-nums">{images.length}</span>
            </TabsTrigger>
            <TabsTrigger value="videos">
              <VideoIcon className="size-4" />
              Videos
              <span className="text-muted-foreground tabular-nums">{videos.length}</span>
            </TabsTrigger>
            <TabsTrigger value="files">
              <FileIcon className="size-4" />
              Files
              <span className="text-muted-foreground tabular-nums">{files.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="images">
            <AssetGrid
              assets={shown(images)}
              searching={needle !== ''}
              canEdit={canEdit}
              onDelete={setDeleting}
            />
          </TabsContent>

          <TabsContent value="videos">
            <AssetGrid
              assets={shown(videos)}
              searching={needle !== ''}
              canEdit={canEdit}
              onDelete={setDeleting}
              kind="video"
            />
          </TabsContent>

          <TabsContent value="files">
            <AssetList
              assets={shown(files)}
              searching={needle !== ''}
              canEdit={canEdit}
              onDelete={setDeleting}
            />
          </TabsContent>
        </Tabs>
      )}

      <p className="text-xs text-muted-foreground">
        {plural(library.assets.length, 'asset')} in this dataset&rsquo;s library. A page of assets is
        a page — <span className="font-mono">listAssets</span> takes a limit and answers a next
        token, and the studio asks for the set rather than a slice of it, because every reference in
        every document resolves through it. So the search above reads the filenames that arrived,
        and nothing else.
      </p>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title={`Delete ${deleting?.filename ?? 'this asset'}?`}
        description={
          <>
            The object and its row are removed for good. Documents that reference it keep the
            reference they were written with, and they will draw a placeholder from now on — uploading
            the same file again mints a new asset, so it does not repair them.
          </>
        }
        confirmLabel="Delete asset"
        pending={pending}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

/**
 * The images, and the videos, as the tiles a person recognises one by.
 *
 * One grid for both because they are one shape of thing — a picture you look at,
 * with a name under it — and the difference is only what draws it: an `img` for a
 * still, a `video` for a clip. The empty state is where the two part company,
 * because "no images yet" and "no videos yet" are different sentences.
 */
function AssetGrid({
  assets,
  searching,
  canEdit,
  onDelete,
  kind = 'image',
}: {
  assets: Asset[];
  searching: boolean;
  canEdit: boolean;
  onDelete: (asset: Asset) => void;
  kind?: 'image' | 'video';
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={kind === 'video' ? <VideoIcon className="size-5" /> : <SearchIcon className="size-5" />}
        title={
          searching
            ? `No ${kind} matches that`
            : kind === 'video'
              ? 'No videos yet'
              : 'No images yet'
        }
        description={
          searching
            ? 'Search reads filenames only — an asset is called whatever it was called when it was uploaded.'
            : kind === 'video'
              ? 'A video is uploaded the same way an image is, and a document points at it with a Video field. Nothing here is transcoded: the file you upload is the file that is served.'
              : 'Images are the assets a document draws. A file uploaded as anything but an image is listed under Files.'
        }
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {assets.map((asset) => (
        <Card key={asset.assetId} className="overflow-hidden">
          {asset.kind === 'video' ? (
            <video
              src={asset.url}
              preload="metadata"
              controls
              className="h-40 w-full border-b border-border bg-black object-cover"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`, and the URL is already transformed. */
            <img
              src={asset.url}
              alt={asset.filename}
              loading="lazy"
              className="h-40 w-full border-b border-border bg-muted object-cover"
            />
          )}
          <CardContent className="space-y-2 p-3">
            <p className="truncate text-sm font-medium" title={asset.filename}>
              {asset.filename}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[dimensionsOf(asset), asset.contentType, formatBytes(asset.size)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              added {relativeTime(asset.createdAt)}
            </p>
            <AssetActions asset={asset} canEdit={canEdit} onDelete={onDelete} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** The files, as the rows a list of names wants. */
function AssetList({
  assets,
  searching,
  canEdit,
  onDelete,
}: {
  assets: Asset[];
  searching: boolean;
  canEdit: boolean;
  onDelete: (asset: Asset) => void;
}) {
  if (assets.length === 0) {
    return (
      <EmptyState
        icon={<SearchIcon className="size-5" />}
        title={searching ? 'No file matches that' : 'No files yet'}
        description={
          searching
            ? 'Search reads filenames only — a file is called whatever it was called when it was uploaded.'
            : 'Anything that is not an image or a video — a PDF, a font, an archive — is a file, and a document points at it the same way it points at a picture.'
        }
      />
    );
  }

  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {assets.map((asset) => (
        <div key={asset.assetId} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <FileIcon className="size-4" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={asset.filename}>
              {asset.filename}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{asset.contentType}</span> · {formatBytes(asset.size)} ·
              added {relativeTime(asset.createdAt)} by{' '}
              <span className="font-mono">{asset.uploadedBy}</span>
            </p>
          </div>

          <AssetActions asset={asset} canEdit={canEdit} onDelete={onDelete} />
        </div>
      ))}
    </div>
  );
}

/** What can be done to a row of the library, whichever tab it is drawn in. */
function AssetActions({
  asset,
  canEdit,
  onDelete,
}: {
  asset: Asset;
  canEdit: boolean;
  onDelete: (asset: Asset) => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <CopyButton value={asset.url} label="Copy URL" />
      <a
        href={asset.url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <ExternalLinkIcon className="size-3" />
        Open
      </a>
      {canEdit && (
        <button
          type="button"
          onClick={() => onDelete(asset)}
          aria-label={`Delete ${asset.filename}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2Icon className="size-3" />
          Delete
        </button>
      )}
    </div>
  );
}

/** `1200×800`, or nothing when the asset was never measured. */
function dimensionsOf(asset: Asset): string {
  return asset.width && asset.height ? `${asset.width}×${asset.height}` : '';
}
