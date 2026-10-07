'use client';

import { useRef, useState, type DragEvent } from 'react';
import { Loader2Icon, UploadIcon } from 'lucide-react';
import { toast } from 'sonner';
import { uploadAsset } from '@achar/api';
import type { Asset } from '@achar/types';
import { Button, cn } from '@achar/ui';
import { useAssetLibrary } from '@/components/studio/asset-library';
import { useAcharClient } from '@/components/client-provider';
import { useStudio } from '@/components/studio/studio-context';
import { ReadOnlyNote } from '@/components/ui/empty-state';
import { errorMessage } from '@/lib/errors';

/** A file on its way to the bucket, and how far along it is. */
interface Uploading {
  key: number;
  name: string;
  percent: number;
}

/**
 * Getting a file into the dataset's library, by dropping it or picking it.
 *
 * The bytes never touch the API: a ticket is claimed, the file goes straight to
 * S3 through `uploadAsset`, and the commit records what landed. What that means
 * for this control is that progress is real progress — the number comes from the
 * `XMLHttpRequest` carrying the bytes, not from a spinner — which is the reason
 * the list under the drop zone exists at all.
 *
 * Uploads run one at a time, in the order they were dropped. Twenty at once is
 * twenty progress bars crawling against one throttled connection, and the slower
 * of them looks like a failure; a queue keeps the bar honest and the retry cheap
 * — a file that fails is one toast, and the ones behind it still run.
 *
 * Every finished asset is handed to the library with `remember`, so the grid, the
 * picker and the document preview showing a reference all have it before the next
 * read of the list gets there.
 */
export function AssetUpload({
  accept,
  onUploaded,
  className,
  compact,
}: {
  accept?: 'image' | 'file' | 'all';
  onUploaded?: (asset: Asset) => void;
  className?: string;
  compact?: boolean;
}): React.ReactElement {
  const client = useAcharClient();
  const { projectId, dataset, canEdit } = useStudio();
  const { remember } = useAssetLibrary();

  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<Uploading[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const queue = useRef<{ key: number; file: File }[]>([]);
  const draining = useRef(false);
  const nextKey = useRef(0);
  // A drag crossing the edge of a child element fires `dragleave` on the parent,
  // so the highlight is counted rather than toggled: a nested icon would
  // otherwise blink the surface off under the pointer.
  const depth = useRef(0);

  /**
   * The queue, one file at a time.
   *
   * Kept in a `ref` rather than in state because the loop below outlives the
   * render that started it: state read at the top of an `await` is state as it
   * was, and a queue that worked off a stale array would upload the same file
   * twice. Only what a person looks at is state.
   */
  async function drain() {
    if (draining.current) return;
    draining.current = true;
    try {
      for (;;) {
        const next = queue.current[0];
        if (!next) break;
        try {
          const asset = await uploadAsset(client, projectId, dataset, next.file, (percent) => {
            setUploading((current) =>
              current.map((entry) => (entry.key === next.key ? { ...entry, percent } : entry)),
            );
          });
          remember(asset);
          onUploaded?.(asset);
        } catch (cause) {
          toast.error(errorMessage(cause));
        } finally {
          queue.current = queue.current.slice(1);
          setUploading((current) => current.filter((entry) => entry.key !== next.key));
        }
      }
    } finally {
      draining.current = false;
    }
  }

  function enqueue(files: File[]) {
    // An image surface is the one filter worth drawing here: `accept` on the
    // input only guides the picker, and nothing stops a folder from being
    // dropped on it. A plain file surface takes anything, because a file field
    // may point at an image just as legally as at a PDF.
    const wanted =
      accept === 'image' ? files.filter((file) => file.type.startsWith('image/')) : files;

    if (wanted.length === 0) {
      if (files.length > 0) toast.error('Only images can go here');
      return;
    }

    const queued = wanted.map((file) => ({ key: nextKey.current++, file }));
    queue.current = [...queue.current, ...queued];
    setUploading((current) => [
      ...current,
      ...queued.map(({ key, file }) => ({ key, name: file.name, percent: 0 })),
    ]);
    void drain();
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }

  function onDragLeave() {
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    enqueue(Array.from(event.dataTransfer.files));
  }

  // A viewer is told why the surface is not there rather than handed a disabled
  // one: an upload that greys out reads as a broken button, and the rule — the
  // role — is the thing they need to know.
  if (!canEdit) {
    return (
      <ReadOnlyNote className={className}>
        Uploading is off. You have view-only access to this project, so the library can be read and
        not added to.
      </ReadOnlyNote>
    );
  }

  return (
    <div className={className}>
      <div
        onDragEnter={onDragEnter}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          'rounded-xl border border-dashed border-border bg-card transition-colors',
          compact ? 'flex flex-wrap items-center gap-2 px-3 py-2' : 'px-4 py-6 text-center',
          dragging && 'border-primary bg-accent',
        )}
      >
        {compact ? (
          <>
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {dragging
                ? 'Drop to upload'
                : accept === 'image'
                  ? 'Drop images here, or'
                  : 'Drop files here, or'}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => input.current?.click()}
            >
              {uploading.length > 0 ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <UploadIcon className="size-4" />
              )}
              Upload
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              {uploading.length > 0 ? (
                <Loader2Icon className="size-5 animate-spin" />
              ) : (
                <UploadIcon className="size-5" />
              )}
            </div>
            <p className="mt-3 text-sm font-medium">
              {dragging ? 'Drop to upload' : 'Drop a file here, or pick one'}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {accept === 'image'
                ? 'Images only. They are uploaded straight to storage and appear in the library the moment they land.'
                : 'Uploaded straight to storage, and in the library the moment they land.'}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => input.current?.click()}
            >
              <UploadIcon className="size-4" />
              Choose a file
            </Button>
          </>
        )}

        <input
          ref={input}
          type="file"
          multiple
          hidden
          {...(accept === 'image' ? { accept: 'image/*' } : {})}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            // Cleared so that picking the same file twice uploads it twice: an
            // input that still holds its value fires no change event the second
            // time, and a re-upload is exactly how a bad file is replaced.
            event.target.value = '';
            enqueue(files);
          }}
        />
      </div>

      {uploading.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {uploading.map((entry) => (
            <li key={entry.key} className="rounded-lg border border-border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                <Loader2Icon className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-xs">{entry.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {entry.percent}%
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${entry.percent}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
