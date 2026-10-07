'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftIcon, ArrowRightIcon, FilePlus2Icon, PlusIcon, SearchIcon } from 'lucide-react';
import type { DocumentSummary, SchemaType } from '@achar/types';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@achar/ui';
import { PublishStateBadge, TypeBadge } from '@/components/content/badges';
import { useAssetLibrary } from '@/components/content/asset-library';
import { useStudio } from '@/components/studio/studio-context';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useDocuments } from '@/hooks/use-documents';
import { relativeTime } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { newDocumentId, routes } from '@/lib/routes';

const PAGE_SIZE = 25;

/**
 * The documents of one type.
 *
 * This is the screen the studio is used for most, so it is built for the two
 * things that get done on it: finding a document — search, and the type's own
 * orderings rather than an alphabet nobody wrote down — and starting one. Every
 * row is called what the schema says it is called, and says where it sits in the
 * draft/publish pair, because "edited since it was published" is precisely the
 * state an editor is looking for.
 *
 * Paging is by the API's token rather than by an offset: a dataset is written to
 * while it is being read, and a page numbered by position skips a document every
 * time somebody publishes one.
 */
export default function ContentListPage({
  params,
}: {
  params: Promise<{ projectId: string; dataset: string; type: string }>;
}) {
  const { projectId, dataset, type: typeName } = use(params);
  const { types, canEdit } = useStudio();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [ordering, setOrdering] = useState('');

  // Debounced rather than sent per keystroke: every character is a request that
  // returns a list nobody read, and answers that arrive out of order are a list
  // that flickers.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(timer);
  }, [term]);

  const type = types.find((candidate) => candidate.name === typeName) ?? null;

  if (!type) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          eyebrow={<span className="font-mono">{typeName}</span>}
          title="No such type"
          description="The schema this dataset is authored against does not declare a type by this name."
        />
        <EmptyState
          icon={<FilePlus2Icon className="size-5" />}
          title="That type has gone"
          description="Schemas change, and a list for a type the schema no longer declares has nothing to draw. The types that do exist are in the rail."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.dataset(projectId, dataset)}>Back to the overview</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const chosenOrdering = type.orderings?.find((option) => option.name === ordering);

  return (
    <div className="space-y-5 p-6">
      <PageHeader
        eyebrow={
          <Link href={routes.dataset(projectId, dataset)} className="hover:text-foreground">
            {dataset}
          </Link>
        }
        title={type.title || type.name}
        description={
          type.description ??
          `Every ${type.title || type.name} in this dataset, at the perspective an editor works in.`
        }
        actions={canEdit ? <NewDocumentButton projectId={projectId} dataset={dataset} type={type} /> : undefined}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={`Search ${type.title || type.name} by title`}
            className="pl-8"
            aria-label="Search documents"
          />
        </div>

        {(type.orderings?.length ?? 0) > 0 && (
          <Select value={ordering || (type.orderings?.[0]?.name ?? '')} onValueChange={setOrdering}>
            <SelectTrigger className="w-48" aria-label="Order by">
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent>
              {(type.orderings ?? []).map((option) => (
                <SelectItem key={option.name} value={option.name}>
                  {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Keyed on what the read depends on, so that changing the search or the
          ordering starts again at the first page rather than on page four of a
          result set that no longer exists. */}
      <ContentList
        key={`${type.name}:${debounced}:${chosenOrdering?.name ?? ''}`}
        projectId={projectId}
        dataset={dataset}
        type={type}
        search={debounced.trim()}
        orderBy={chosenOrdering?.by[0]}
        canEdit={canEdit}
      />
    </div>
  );
}

/** The list itself, so that the read, its paging and its empty states sit together. */
function ContentList({
  projectId,
  dataset,
  type,
  search,
  orderBy,
  canEdit,
}: {
  projectId: string;
  dataset: string;
  type: SchemaType;
  search: string;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  canEdit: boolean;
}) {
  const assets = useAssetLibrary();

  // The tokens of the pages walked so far, so that "previous" is the page that
  // was actually shown rather than a recomputed guess at it.
  const [cursor, setCursor] = useState<{ token: string | null; index: number }>({
    token: null,
    index: 0,
  });
  const [tokens, setTokens] = useState<(string | null)[]>([null]);

  const documents = useDocuments(projectId, dataset, {
    type: type.name,
    search: search || undefined,
    order: orderBy ? `${orderBy.field}:${orderBy.direction}` : undefined,
    limit: PAGE_SIZE,
    nextToken: cursor.token,
    perspective: 'previewDrafts',
  });

  const items = documents.data?.items ?? [];
  const nextToken = documents.data?.nextToken ?? null;

  const mediaField = type.preview?.media;

  return (
    <div className="space-y-4">
      {documents.error && <ErrorNote>{documents.error}</ErrorNote>}

      {documents.loading && !documents.data ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FilePlus2Icon className="size-5" />}
          title={search ? 'Nothing matches that' : `No ${type.title || type.name} yet`}
          description={
            search
              ? 'Search reads the field the schema names as the preview title. A document whose title is empty, or whose title lives elsewhere, will not be found by it.'
              : canEdit
                ? `A new ${(type.title || type.name).toLowerCase()} starts as a draft, so nothing is published until you say so.`
                : 'Nobody has written one yet, and you are a viewer on this project.'
          }
          action={
            canEdit && !search ? (
              <NewDocumentButton projectId={projectId} dataset={dataset} type={type} />
            ) : undefined
          }
        />
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {items.map((document) => (
            <DocumentRow
              key={document._id}
              projectId={projectId}
              dataset={dataset}
              type={type}
              document={document}
              mediaUrl={
                document.mediaUrl ??
                (mediaField ? assets.urlFor(referenceIn(document, mediaField)) : null)
              }
            />
          ))}
        </div>
      )}

      {(cursor.index > 0 || nextToken) && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={cursor.index === 0}
            onClick={() => {
              const previous = Math.max(0, cursor.index - 1);
              setCursor({ token: tokens[previous] ?? null, index: previous });
            }}
          >
            <ArrowLeftIcon />
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {cursor.index + 1}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={!nextToken}
            onClick={() => {
              if (!nextToken) return;
              setTokens((current) => [...current.slice(0, cursor.index + 1), nextToken]);
              setCursor({ token: nextToken, index: cursor.index + 1 });
            }}
          >
            Next
            <ArrowRightIcon />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * The asset reference in a document's media field.
 *
 * The list endpoint resolves `mediaUrl` itself when it can, but a summary that
 * carries only the reference still has a thumbnail to draw — the library is
 * already loaded, and the field the schema names as the media is the one place
 * to look.
 */
function referenceIn(document: DocumentSummary, field: string): string | null {
  const holder = document as unknown as Record<string, unknown>;
  const value = holder[field];
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ref = (value as { _ref?: unknown })._ref;
    if (typeof ref === 'string') return ref;
  }
  return null;
}

function DocumentRow({
  projectId,
  dataset,
  type,
  document,
  mediaUrl,
}: {
  projectId: string;
  dataset: string;
  type: SchemaType;
  document: DocumentSummary;
  mediaUrl: string | null;
}) {
  const Icon = iconFor(type.icon);

  return (
    <Link
      href={routes.document(projectId, dataset, type.name, document._id)}
      className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      {mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`, and the URL is already transformed.
        <img
          src={mediaUrl}
          alt=""
          className="size-10 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.title || document._id}</p>
        <p className="truncate text-xs text-muted-foreground">
          {document.subtitle || <span className="font-mono">{document._id}</span>}
        </p>
      </div>

      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <TypeBadge name={document._type} />
        <PublishStateBadge hasDraft={document.hasDraft} published={document.published} />
      </div>

      <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
        {relativeTime(document._updatedAt)}
      </span>
    </Link>
  );
}

/**
 * Starting a document.
 *
 * The id is minted here rather than by the API, because the editor opens on a
 * document that does not exist yet: the first keystroke is what creates the
 * draft, which is why an abandoned "new" leaves nothing behind on the server.
 */
function NewDocumentButton({
  projectId,
  dataset,
  type,
}: {
  projectId: string;
  dataset: string;
  type: SchemaType;
}) {
  const router = useRouter();

  return (
    <Button
      size="sm"
      onClick={() =>
        router.push(`${routes.document(projectId, dataset, type.name, newDocumentId())}?new=1`)
      }
    >
      <PlusIcon />
      New {type.title || type.name}
    </Button>
  );
}
