'use client';

import { use } from 'react';
import Link from 'next/link';
import { DatabaseIcon, UsersIcon } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@achar/ui';
import { AppPage } from '@/components/studio/app-header';
import { CreateDatasetDialog } from '@/components/studio/create-dataset-dialog';
import { DatasetCard } from '@/components/studio/dataset-card';
import { ProjectSettingsCard } from '@/components/studio/project-settings-card';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';
import { PageHeader, StatBlock } from '@/components/ui/page-header';
import { useDatasets } from '@/hooks/use-datasets';
import { useProject } from '@/hooks/use-projects';
import { canAdmin } from '@/lib/roles';
import { routes } from '@/lib/routes';

/**
 * A project: its datasets, its settings, and the way to its people.
 *
 * The datasets come first because they are why anybody opens a project — the
 * settings below are a thing you do once, and the roster is one link away
 * because it is the other thing a project *is*. Everything on this page is
 * either a dataset or a property of the project, which is the split the whole
 * model rests on.
 */
export default function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const project = useProject(projectId);
  const datasets = useDatasets(projectId);

  const admin = canAdmin(project.data?.role);

  return (
    <AppPage>
      {project.error && <ErrorNote>{project.error}</ErrorNote>}

      {project.data ? (
        <>
          <PageHeader
            eyebrow={<span className="font-mono">{project.data.slug}</span>}
            title={project.data.name}
            description={
              <>
                {project.data.organizationName} — datasets hold the content; members hold the right
                to change it.
              </>
            }
            actions={
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href={routes.members(projectId)}>
                    <UsersIcon />
                    Members
                  </Link>
                </Button>
                <CreateDatasetDialog projectId={projectId} onCreated={datasets.refresh} />
              </>
            }
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <StatBlock label="Datasets" value={project.data.datasetCount} />
            <StatBlock label="Members" value={project.data.memberCount} />
            <StatBlock label="Your role" value={project.data.role.toLowerCase()} />
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Datasets</h2>

        {datasets.error && <ErrorNote>{datasets.error}</ErrorNote>}

        {datasets.loading && !datasets.data ? (
          <div className="grid gap-5 sm:grid-cols-2">
            {[0, 1].map((index) => (
              <Card key={index}>
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-4 w-1/2 rounded-md" />
                  <Skeleton className="h-3 w-1/3 rounded-md" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (datasets.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<DatabaseIcon className="size-5" />}
            title="No datasets yet"
            description={
              <>
                A dataset is a content store — <span className="font-mono">production</span> is the
                usual first one, and <span className="font-mono">staging</span> the usual second.
                Each is authored against its own schema, so the two can hold different content
                without either being a copy of the other.
              </>
            }
            action={<CreateDatasetDialog projectId={projectId} onCreated={datasets.refresh} />}
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {(datasets.data ?? []).map((dataset) => (
              <DatasetCard key={dataset.datasetName} projectId={projectId} dataset={dataset} />
            ))}
          </div>
        )}
      </section>

      {project.data && (
        <ProjectSettingsCard
          project={project.data}
          canAdmin={admin}
          onSaved={() => {
            project.refresh();
          }}
        />
      )}
    </AppPage>
  );
}
