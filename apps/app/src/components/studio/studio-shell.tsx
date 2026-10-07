'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRightIcon, ExternalLinkIcon } from 'lucide-react';
import { Badge, Separator, Skeleton } from '@achar/ui';
import { useDatasets } from '@/hooks/use-datasets';
import { useProject } from '@/hooks/use-projects';
import { useSchema } from '@/hooks/use-schema';
import { routes } from '@/lib/routes';
import { studioBreadcrumbs } from '@/lib/studio-breadcrumbs';
import { documentTypesOf } from '@/lib/schema';
import { roleLabel } from '@/lib/roles';
import { ErrorNote } from '@/components/ui/empty-state';
import { AssetLibraryProvider } from '@/components/studio/asset-library';
import { StudioProvider, useStudio } from '@/components/studio/studio-context';
import { StudioRail } from '@/components/studio/studio-rail';

/**
 * The studio itself: a rail down the left, a bar across the top, and the screen
 * in the middle.
 *
 * This is the frame every dataset screen is drawn in, and the reason it is a
 * layout rather than a component each page wraps itself in is that the three
 * reads below — the project, the schema, the dataset's assets — are the same
 * three for every one of them. A page that fetched the schema again would be a
 * page that could disagree with the rail, and the rail is what tells a person
 * which types exist.
 *
 * The API client itself comes from the gate above, which is where the token is
 * available: everything below this point is signed in by definition, and a shell
 * that built its own client would be a second one for the same session.
 */
export function StudioShell({
  projectId,
  dataset,
  children,
}: {
  projectId: string;
  dataset: string;
  children: React.ReactNode;
}) {
  const project = useProject(projectId);
  const schema = useSchema(projectId, dataset);
  const datasets = useDatasets(projectId);

  if (project.error || schema.error) {
    return (
      <div className="mx-auto flex min-h-svh max-w-2xl flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-semibold">This dataset is not available</h1>
        <ErrorNote>{project.error ?? schema.error}</ErrorNote>
        <Link className="text-sm text-primary underline" href={routes.projectPicker()}>
          Back to your projects
        </Link>
      </div>
    );
  }

  if (!project.data || !schema.data) {
    return (
      <div className="flex h-svh">
        <div className="w-60 shrink-0 border-r border-border bg-card p-3">
          <Skeleton className="h-9 w-full rounded-lg" />
          <div className="mt-4 space-y-2">
            <Skeleton className="h-6 w-full rounded-md" />
            <Skeleton className="h-6 w-5/6 rounded-md" />
            <Skeleton className="h-6 w-4/6 rounded-md" />
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-64 rounded-lg" />
          <Skeleton className="mt-6 h-40 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const types = documentTypesOf(schema.data.types);

  return (
    <StudioProvider
      project={project.data}
      dataset={dataset}
      datasetInfo={datasets.data?.find((candidate) => candidate.datasetName === dataset) ?? null}
      schema={schema.data}
      types={types}
      refreshSchema={schema.refresh}
    >
      <AssetLibraryProvider projectId={projectId} dataset={dataset}>
        <div className="flex h-svh w-full overflow-hidden bg-background">
          <StudioRail datasets={datasets.data ?? [{ datasetName: dataset }]} />
          <div className="flex min-w-0 flex-1 flex-col">
            <StudioTopBar />
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
          </div>
        </div>
      </AssetLibraryProvider>
    </StudioProvider>
  );
}

/**
 * Where you are, and what this dataset is.
 *
 * A studio is deep — four segments between the front door and a paragraph — so
 * the bar carries the whole trail rather than a title. The visibility badge is
 * on it because it is the one thing about a dataset that is easy to forget and
 * expensive to be wrong about: a public dataset answers queries without a
 * token.
 */
function StudioTopBar() {
  const { project, dataset, datasetInfo, types } = useStudio();
  const pathname = usePathname();
  const crumbs = studioBreadcrumbs({
    pathname,
    projectName: project.name,
    dataset,
    types,
  });

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <span key={crumb.href} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground" />}
            {index === crumbs.length - 1 ? (
              <span className="truncate font-medium text-foreground">{crumb.label}</span>
            ) : (
              <Link
                href={crumb.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {datasetInfo && (
          <Badge variant="outline" className="font-normal text-muted-foreground">
            {datasetInfo.visibility === 'PUBLIC' ? 'Public dataset' : 'Private dataset'}
          </Badge>
        )}
        <Badge variant="outline" className="font-normal text-muted-foreground">
          {roleLabel(project.role)}
        </Badge>
        <Separator orientation="vertical" className="h-5" />
        <Link
          href={routes.api(project.projectId, dataset)}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          API
          <ExternalLinkIcon className="size-3" />
        </Link>
      </div>
    </header>
  );
}

