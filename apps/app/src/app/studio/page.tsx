'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderPlusIcon, LayersIcon } from 'lucide-react';
import type { Project } from '@achar/types';
import { Button, Card, CardContent, Skeleton } from '@achar/ui';
import { AppPage } from '@/components/studio/app-header';
import { CreateProjectDialog } from '@/components/studio/create-project-dialog';
import { DeleteOrganizationDialog } from '@/components/studio/delete-organization-dialog';
import { PendingInvitations } from '@/components/studio/pending-invitations';
import { ProjectCard } from '@/components/studio/project-card';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useInvitations, useProjects } from '@/hooks/use-projects';
import { canAdmin } from '@/lib/roles';
import { routes } from '@/lib/routes';

/**
 * The front door: every project you can open, gathered by who they belong to, and
 * the two ways to get another.
 *
 * This is what `/` is in the studio, because a studio has no public face — the
 * first question is always "which content", and a marketing page in front of
 * that question is a page everybody clicks past once. Invitations come first
 * because they are addressed to somebody who is not in any of the projects
 * below, and an offer is easy to lose under a grid.
 *
 * The grouping is the organization, which is a field on each project rather than a
 * row anywhere — so a heading here is a set of projects that name the same
 * organization, and the one act that belongs at that level is ending all of them.
 * See `groupByOrganization`.
 *
 * `?view=new-project` arrives with the form up. The query is an instruction spent
 * on arrival, so it is dropped from the URL as soon as it has been obeyed: left
 * there, it would reopen the dialog on every reload and make Back a button that
 * does nothing.
 */
export default function ProjectPickerPage() {
  const projects = useProjects();
  const invitations = useInvitations();
  const router = useRouter();
  const params = useSearchParams();

  const newProject = params.get('view') === 'new-project';

  useEffect(() => {
    if (newProject) router.replace(routes.projectPicker());
  }, [newProject, router]);

  return (
    <AppPage>
      <PageHeader
        title="Your projects"
        description="A project owns datasets and people. Pick one to author against, or make the first one."
        actions={<CreateProjectDialog defaultOpen={newProject} />}
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
        <div className="space-y-8">
          {groupByOrganization(projects.data ?? []).map((group) => (
            <section key={group.name} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-medium text-muted-foreground">{group.name}</h2>
                {/* Only when every project under this heading is one this person
                    may delete — see `groupByOrganization`. */}
                {group.deletable && (
                  <DeleteOrganizationDialog
                    organization={group.name}
                    projects={group.projects}
                    onDeleted={projects.refresh}
                  />
                )}
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                {group.projects.map((project) => (
                  <ProjectCard key={project.projectId} project={project} />
                ))}
              </div>
            </section>
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

/** One organization's projects, and whether this person may end all of them. */
interface OrganizationGroup {
  name: string;
  projects: Project[];
  deletable: boolean;
}

/**
 * The projects, gathered by the organization each one names.
 *
 * An organization is not a row anywhere in this API: `organizationName` is a field
 * on a project, and this is a grouping over those fields and nothing more. Two
 * projects that name the same organization sit under one heading, which is where
 * ending all of them at once belongs.
 *
 * **`deletable` is every project in the group, not any of them.** An organization
 * delete walks the group one request at a time, so an admin of half of it would
 * either stop at the first 403 or leave an organization standing with fewer
 * projects than it had — and a destructive action that half-succeeds silently is
 * worse than one that is not offered. The projects they do administer are still
 * deletable from their own pages.
 *
 * Alphabetical by organization, and the projects inside a group in the order the
 * API answered with. A project that names no organization gets its own heading
 * rather than being folded under one it does not belong to.
 */
function groupByOrganization(projects: Project[]): OrganizationGroup[] {
  const groups = new Map<string, Project[]>();

  for (const project of projects) {
    const name = project.organizationName.trim() || 'No organization';
    groups.set(name, [...(groups.get(name) ?? []), project]);
  }

  return [...groups.entries()]
    .map(([name, members]) => ({
      name,
      projects: members,
      deletable: members.every((project) => canAdmin(project.role)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
