'use client';

import Link from 'next/link';
import { ArrowRightIcon, DatabaseIcon, ImageIcon, FileTextIcon } from 'lucide-react';
import type { Dataset } from '@achar/types';
import { Card, CardContent } from '@achar/ui';
import { VisibilityBadge } from '@/components/studio/badges';
import { relativeTime } from '@/lib/format';
import { routes } from '@/lib/routes';

/**
 * One dataset, as the way in.
 *
 * The counts are what tells somebody which of these is the real one: a
 * `staging` with four documents and a `production` with four hundred look
 * identical without them, and picking the wrong one is the mistake this card
 * exists to prevent.
 */
export function DatasetCard({ projectId, dataset }: { projectId: string; dataset: Dataset }) {
  return (
    <Link href={routes.dataset(projectId, dataset.datasetName)} className="group block">
      <Card className="h-full transition-colors group-hover:border-ring/60 group-hover:bg-accent/40">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <DatabaseIcon className="size-4 shrink-0 text-muted-foreground" />
              <p className="truncate font-mono text-sm text-foreground">{dataset.datasetName}</p>
            </div>
            <VisibilityBadge visibility={dataset.visibility} />
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <FileTextIcon className="size-3.5" />
              {dataset.documentCount} {dataset.documentCount === 1 ? 'document' : 'documents'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ImageIcon className="size-3.5" />
              {dataset.assetCount} {dataset.assetCount === 1 ? 'asset' : 'assets'}
            </span>
          </div>

          <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {dataset.lastMutationAt
                ? `last written ${relativeTime(dataset.lastMutationAt)}`
                : 'nothing written yet'}
            </span>
            <span className="inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              Open
              <ArrowRightIcon className="size-3" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
