'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, UsersIcon } from 'lucide-react';
import type { Member } from '@achar/types';
import { Button, Skeleton } from '@achar/ui';
import { RoleBadge } from '@/components/content/badges';
import { AppPage } from '@/components/studio/app-header';
import { InviteMemberDialog } from '@/components/studio/invite-member-dialog';
import { MemberRow } from '@/components/studio/member-row';
import { EmptyState, ErrorNote, ReadOnlyNote } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { useMembers } from '@/hooks/use-members';
import { useProject } from '@/hooks/use-projects';
import { plural } from '@/lib/format';
import { canAdmin, roleLabel } from '@/lib/roles';
import { routes } from '@/lib/routes';

/**
 * A project's people, in the one list the API answers with.
 *
 * This route is a project-level screen rather than a dataset one — there is no
 * dataset to switch and no rail to hang a title on — so it wears `AppPage` and
 * reads the project itself. Members and unaccepted invitations share the list
 * because they are one question to whoever opens it: who is on this project.
 * What separates them is the row: an invitation is drawn as an offer, with the
 * address it was sent to, and it does not pretend to be a membership.
 *
 * Everything an admin can do here is drawn only for an admin, and everyone else
 * gets one line saying so. A viewer looking at a roster of greyed-out controls
 * learns that the studio is broken; a viewer told the rule learns the rule.
 */
export default function MembersPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = use(params);
  const project = useProject(projectId);
  const members = useMembers(projectId);

  const roster = members.data ?? [];
  const active = roster.filter((member) => member.status === 'ACTIVE');
  const invited = roster.filter((member) => member.status === 'INVITED');
  // Members first, so the roster reads as the project and the outstanding offers
  // as what is about to join it.
  const ordered: Member[] = [...active, ...invited];

  if (!project.data) {
    return (
      <AppPage>
        {project.error && <ErrorNote>{project.error}</ErrorNote>}
        {members.error && <ErrorNote>{members.error}</ErrorNote>}

        <div className="space-y-4">
          <Skeleton className="h-9 w-64 rounded-lg" />
          <Skeleton className="h-4 w-80 rounded-md" />
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </AppPage>
    );
  }

  const admin = canAdmin(project.data.role);
  const projectName = project.data.name;

  const summary =
    invited.length === 0
      ? `${plural(active.length, 'member')} on this project, and no outstanding invitations.`
      : `${plural(active.length, 'member')} on this project, and ${plural(
          invited.length,
          'invitation',
        )} nobody has accepted yet.`;

  return (
    <AppPage>
      {project.error && <ErrorNote>{project.error}</ErrorNote>}
      {members.error && <ErrorNote>{members.error}</ErrorNote>}

      <PageHeader
        eyebrow="Members"
        title={projectName}
        description={summary}
        actions={
          <>
            <RoleBadge role={project.data.role} />
            <Button variant="outline" size="sm" asChild>
              <Link href={routes.project(projectId)}>
                <ArrowLeftIcon />
                Back to project
              </Link>
            </Button>
            {admin && (
              <InviteMemberDialog
                projectId={projectId}
                projectName={projectName}
                onInvited={() => {
                  members.refresh();
                  // The project carries `memberCount`, so the number the project
                  // page shows moves with the roster this page just changed.
                  project.refresh();
                }}
              />
            )}
          </>
        }
      />

      {!admin && (
        <ReadOnlyNote>
          You are a {roleLabel(project.data.role).toLowerCase()} on this project, so you can see who
          is here and nothing more. Inviting somebody, moving them between roles and removing them
          are all admin actions.
        </ReadOnlyNote>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">Members and invitations</h2>

        {members.loading && !members.data ? (
          <div className="space-y-2">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={<UsersIcon className="size-5" />}
            title="Nobody is on this project"
            description="A roster is every member and every invitation. A project always has at least the person who made it, so this is the moment between a write and the read that follows it."
          />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {ordered.map((member) => (
              <MemberRow
                key={member.userId}
                projectId={projectId}
                projectName={projectName}
                member={member}
                canAdmin={admin}
                onChanged={members.refresh}
              />
            ))}
          </div>
        )}
      </section>

      <p className="pt-2 text-xs text-muted-foreground">
        A role decides what somebody may do — an admin manages the project and its people, an editor
        writes content, a viewer reads it. An invitation is not a membership: until it is accepted
        it grants nothing, and the API treats the row as no member at all.
      </p>
    </AppPage>
  );
}
