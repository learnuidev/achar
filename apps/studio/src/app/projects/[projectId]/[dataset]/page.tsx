'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowRightIcon, FileTextIcon, ImageIcon, LayersIcon, PencilIcon } from 'lucide-react';
import type { AcharDocument, SchemaType } from '@achar/types';
import { Card, CardContent, Skeleton } from '@achar/ui';
import { EmptyState, ErrorNote, ReadOnlyNote } from '@/components/ui/empty-state';
import { PageHeader, StatBlock } from '@/components/ui/page-header';
import { useAssetLibrary } from '@/components/content/asset-library';
import { useStudio } from '@/components/studio/studio-context';
import { useContentStats } from '@/hooks/use-content-stats';
import { relativeTime } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { routes } from '@/lib/routes';
import { previewOf } from '@achar/schema';

/**
 * A dataset's overview, and the four numbers that say whether it is alive.
 *
 * It doubles as the router: the first thing somebody wants after connecting a
 * dataset is the list of what is in it, so every type here is a way in and the
 * first one is the one the studio is *for*. The recent list is drawn from the
 * `_updatedAt` the API keeps on every row, which is the only honest answer to
 * "what changed" — a document's own `publishedAt` says when it was meant to be
 * read, not when somebody last typed in it.
 */
export default function DatasetOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; dataset: string }>;
}) {
  const { projectId, dataset } = use(params);
  const { types, schema, canEdit, datasetInfo } = useStudio();
  const stats = useContentStats(projectId, dataset, types);
  const assets = useAssetLibrary();

  if (types.length === 0) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title={dataset} description="This dataset's schema declares no document types." />
        <EmptyState
          icon={<LayersIcon className="size-5" />}
          title="Nothing to author yet"
          description={
            <>
              A dataset is authored against a schema, and this one declares no types of kind{' '}
              <span className="font-mono">document</span> — so there is no list of anything. The
              schema is read-only here; write it with{' '}
              <span className="font-mono">PUT /v1/projects/{projectId}/datasets/{dataset}/schema</span>{' '}
              or by seeding the dataset.
            </>
          }
          action={
            <Link
              href={routes.schema(projectId, dataset)}
              className="text-sm text-primary underline"
            >
              Look at the schema
            </Link>
          }
        />
      </div>
    );
  }

  const total = stats.data?.counts.reduce((sum, entry) => sum + entry.count, 0) ?? 0;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={<span className="font-mono">schema {schema.revision.slice(0, 7)}</span>}
        title={dataset}
        description={
          <>
            {types.length} document {types.length === 1 ? 'type' : 'types'} in this dataset&rsquo;s
            schema. Pick one to see its documents, or write a new one.
          </>
        }
        actions={
          canEdit ? (
            <Link
              href={routes.content(projectId, dataset, types[0]?.name ?? '')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
            >
              <PencilIcon className="size-4" />
              Open {types[0]?.title ?? types[0]?.name}
            </Link>
          ) : undefined
        }
      />

      {!canEdit && (
        <ReadOnlyNote>
          You are a viewer on this project, so the studio shows you what is here and offers no
          editing.
        </ReadOnlyNote>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock label="Documents" value={total} hint="across every type" />
        <StatBlock label="Types" value={types.length} hint="declared as documents" />
        <StatBlock label="Assets" value={assets.assets.length} hint="in the library" />
        <StatBlock
          label="Last written"
          value={datasetInfo?.lastMutationAt ? relativeTime(datasetInfo.lastMutationAt) : 'never'}
        />
      </div>

      {stats.error && <ErrorNote>{stats.error}</ErrorNote>}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Content</h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((type) => (
            <TypeTile
              key={type.name}
              projectId={projectId}
              dataset={dataset}
              type={type}
              count={stats.data?.counts.find((entry) => entry.type.name === type.name)?.count}
              loading={stats.loading}
            />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recently edited</h2>

        {stats.loading && !stats.data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : (stats.data?.recent.length ?? 0) === 0 ? (
          <EmptyState
            icon={<FileTextIcon className="size-5" />}
            title="Nothing has been written yet"
            description="Every document in this dataset will appear here in the order it was last touched. Empty is the normal state of a new dataset, and the way out of it is the list of a type."
          />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {(stats.data?.recent ?? []).map((document) => (
              <RecentRow
                key={document._id}
                projectId={projectId}
                dataset={dataset}
                document={document}
                types={types}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** One type in the schema, and how much of it there is. */
function TypeTile({
  projectId,
  dataset,
  type,
  count,
  loading,
}: {
  projectId: string;
  dataset: string;
  type: SchemaType;
  count: number | undefined;
  loading: boolean;
}) {
  const Icon = iconFor(type.icon);

  return (
    <Link href={routes.content(projectId, dataset, type.name)} className="group block">
      <Card className="h-full transition-colors group-hover:border-ring/60 group-hover:bg-accent/40">
        <CardContent className="flex items-start gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{type.title || type.name}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{type.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {loading && count === undefined
                ? 'counting…'
                : `${count ?? 0} ${count === 1 ? 'document' : 'documents'}`}
            </p>
          </div>
          <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </CardContent>
      </Card>
    </Link>
  );
}

/**
 * One row of the recent list.
 *
 * The title is the schema's `preview.title` resolved by `@achar/schema`, which
 * is the same rule the document list uses — so a document called one thing in
 * the list is called the same thing here.
 */
function RecentRow({
  projectId,
  dataset,
  document,
  types,
}: {
  projectId: string;
  dataset: string;
  document: AcharDocument;
  types: SchemaType[];
}) {
  const type = types.find((candidate) => candidate.name === document._type);
  const preview = type ? previewOf(type, document) : { title: document._id };
  const updatedAt = typeof document._updatedAt === 'string' ? document._updatedAt : null;
  const hasDraft = document._draft === true;

  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{preview.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{document._type}</span> · edited {relativeTime(updatedAt)}
        </p>
      </div>
      {hasDraft && (
        <span className="shrink-0 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs text-warning">
          draft
        </span>
      )}
    </>
  );

  // A document whose type the schema no longer declares has nowhere to be
  // opened, which is a row rather than a link — the honest drawing of a document
  // orphaned by a schema change.
  if (!type) {
    return <div className="flex items-center gap-3 px-4 py-3 opacity-60">{body}</div>;
  }

  return (
    <Link
      href={routes.document(projectId, dataset, type.name, document._id)}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      {body}
    </Link>
  );
}
