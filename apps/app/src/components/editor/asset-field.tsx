'use client';

import { useState } from 'react';
import { FileIcon, ImageIcon, ImagePlusIcon, ReplaceIcon, XIcon } from 'lucide-react';
import type { Asset } from '@achar/types';
import { Button, cn } from '@achar/ui';
import { hasIssueAt } from '@/lib/schema';
import { formatBytes } from '@/lib/format';
import { useAssetLibrary } from '@/components/studio/asset-library';
import { AssetPicker } from '@/components/editor/asset-picker';
import { FieldShell, type FieldControlProps } from '@/components/editor/field-controls';

/**
 * An image or a file field.
 *
 * What a document stores is a reference string — `image-<assetId>-1200x800-jpg` —
 * and what the studio draws is the asset behind it: the bytes go straight to S3
 * through `uploadAsset`, and this control only ever holds the reference, which is
 * why a document written here and a document written by the API resolve the same
 * way. The library resolves the reference back to a CDN URL, and a reference the
 * library no longer has draws as a labelled placeholder rather than as a broken
 * frame — a deleted asset is a fact about the document worth seeing.
 */
export function AssetField({
  field,
  value,
  onChange,
  path,
  readOnly,
  issues,
  projectId,
  dataset,
}: FieldControlProps) {
  const [open, setOpen] = useState(false);
  const library = useAssetLibrary();
  const kind = field.type === 'file' ? 'file' : 'image';

  const reference = assetReference(value);
  const asset = library.assetFor(reference);
  const url = library.urlFor(reference);

  return (
    <FieldShell field={field} path={path} invalid={hasIssueAt(issues, path)} readOnly={readOnly}>
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border bg-card p-3',
          kind === 'image' && 'items-start',
        )}
      >
        {kind === 'image' ? (
          url ? (
            // eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`, and the URL is already transformed.
            <img
              src={url}
              alt={typeof asset?.filename === 'string' ? asset.filename : ''}
              className="size-20 shrink-0 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="flex size-20 shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-muted-foreground">
              {reference ? <ImageIcon className="size-5" /> : <ImagePlusIcon className="size-5" />}
            </div>
          )
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <FileIcon className="size-4" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {reference ? (
            <>
              <p className="truncate text-sm">
                {asset?.filename ?? (
                  <span className="font-mono text-xs">{reference}</span>
                )}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {asset
                  ? [asset.contentType, formatBytes(asset.size)].join(' · ')
                  : 'Not in this dataset’s library — the document still points at it.'}
              </p>
              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">{reference}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {kind === 'image' ? 'No image chosen' : 'No file chosen'}
            </p>
          )}
        </div>

        {!readOnly && (
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              {reference ? <ReplaceIcon /> : <ImagePlusIcon />}
              {reference ? 'Replace' : 'Choose'}
            </Button>
            {reference && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange(null)}
                className="text-muted-foreground"
              >
                <XIcon className="size-4" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Mounted only while open so that the picker's read of the library is a
          read somebody asked for, rather than one per field on every document. */}
      {open && (
        <AssetPicker
          open={open}
          onOpenChange={setOpen}
          accept={kind}
          onSelect={(asset: Asset) => {
            onChange({ _ref: asset.reference, _type: 'reference' });
            setOpen(false);
          }}
        />
      )}
    </FieldShell>
  );
}

/**
 * The reference a document stores for an asset.
 *
 * Three spellings arrive here — the `{ _ref }` object the studio writes, a bare
 * reference string, and a plain URL somebody pasted — and all three are legal
 * to the validator, so all three are read back.
 */
function assetReference(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ref = (value as { _ref?: unknown })._ref;
    if (typeof ref === 'string') return ref;
  }
  return '';
}
