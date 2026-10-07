'use client';

import { FolderPlusIcon, LayersIcon } from 'lucide-react';
import { Button, Card, CardContent, Skeleton } from '@achar/ui';
import { AppPage } from '@/components/studio/app-header';
import { CreateProjectDialog } from '@/components/studio/create-project-dialog';
import { PendingInvitations } from '@/components/studio/pending-invitations';
import { ProjectCard } from '@/components/studio/project-card';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useInvitations, useProjects } from '@/hooks/use-projects';

/**
 * The front door: every project you can open, and the two ways to get another.
 *
 * This is what `/` is in the studio, because a studio has no public face — the
 * first question is always "which content", and a marketing page in front of
 * that question is a page everybody clicks past once. Invitations come first
 * because they are addressed to somebody who is not in any of the projects
 * below, and an offer is easy to lose under a grid.
 */
export default function ProjectPickerPage() {
  const projects = useProjects();
  const invitations = useInvitations();

  return (
    <AppPage>
      <PageHeader
        title="Your projects"
        description="A project owns datasets and people. Pick one to author against, or make the first one."
        actions={<CreateProjectDialog />}
      />

      {invitations.data && invitations.data.length > 0 && (
        <PendingInvitations invitations={invitations.data} onAccepted={projects.refresh} />
      )}

      {projects.error && <ErrorNote>{projects.error}</ErrorNote>}

      {projects.loading && !projects.data ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Card key={index}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-5 w-2/3 rounded-md" />
                <Skeleton className="h-3 w-1/3 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (projects.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon={<LayersIcon className="size-5" />}
          title="No projects yet"
          description={
            <>
              A project is the collaboration boundary: it holds the datasets, and it is where people
              are given a role. Make one, make a dataset inside it — <span className="font-mono">production</span>{' '}
              is the usual first — and the studio will read that dataset&rsquo;s schema and list its
              documents. Until then there is nothing to author against.
            </>
          }
          action={
            <CreateProjectDialog
              trigger={
                <Button>
                  <FolderPlusIcon />
                  New project
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {(projects.data ?? []).map((project) => (
            <ProjectCard key={project.projectId} project={project} />
          ))}
        </div>
      )}

      <p className="pt-2 text-xs text-muted-foreground">
        A project&rsquo;s datasets are separate content stores — <span className="font-mono">production</span> and{' '}
        <span className="font-mono">staging</span> are two of them rather than one with a flag. What
        a dataset holds is decided by its schema, which the studio reads on every visit.
      </p>
    </AppPage>
  );
}
