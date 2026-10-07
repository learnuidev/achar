'use client';

import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@achar/types';
import { Button } from '@achar/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAction } from '@/hooks/use-resource';
import { errorStatus } from '@/lib/errors';

/**
 * Ending an organization, which here means ending its projects.
 *
 * There is no organization row anywhere to delete: `organizationName` is a field
 * on each project, and an organization is the set of projects that name it. So this
 * is exactly as destructive as deleting every one of them, in order, and it says so
 * before it starts — the names are listed rather than counted, because "3 projects"
 * is not a thing anybody can recognize.
 *
 * One request per project rather than one request for the group, because the API's
 * delete is per project and its cascade is the API's: a batch endpoint would have to
 * re-answer what a project is, and a partial failure here would be a transaction
 * spanning several projects. Failing halfway is therefore a real state, and it is
 * reported as one — which projects went, and which did not.
 *
 * The button is only rendered when the caller administers every project in the
 * group; see the picker. Offered to somebody who admins half of them, it would
 * either stop at the first 403 or leave the organization standing with fewer
 * projects than it had, and both are worse than not offering it.
 */
export function DeleteOrganizationDialog({
  organization,
  projects,
  onDeleted,
}: {
  organization: string;
  projects: Project[];
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [attempted, setAttempted] = useState(0);

  const plural = projects.length === 1 ? 'project' : 'projects';

  const remove = useAction(async (client, targets: Project[]) => {
    const failed: string[] = [];
    for (const [index, project] of targets.entries()) {
      try {
        await client.deleteProject(project.projectId);
      } catch (cause: unknown) {
        // A 404 is the project already being gone — somebody else deleted it, or a
        // second tab did — which is this loop's outcome either way. Anything else
        // is named rather than counted: what matters afterwards is which project is
        // still there.
        if (errorStatus(cause) !== 404) failed.push(project.name);
      }
      setAttempted(index + 1);
    }
    return failed;
  });

  async function confirm() {
    setAttempted(0);
    const failed = await remove.run(projects);

    // Whether it worked or not, the list on screen is out of date now.
    onDeleted();

    if (!failed) {
      toast.error(remove.error ?? 'Could not delete the organization');
    } else if (failed.length > 0) {
      toast.error(`${failed.length} of ${projects.length} could not be deleted`, {
        description: failed.join(', '),
      });
    } else {
      toast.success(`${organization} deleted`, {
        description: `${projects.length} ${plural} and everything in them.`,
      });
    }

    setOpen(false);
    setAttempted(0);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => setOpen(true)}
      >
        <Trash2Icon />
        Delete organization
      </Button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setAttempted(0);
        }}
        title={`Delete ${organization}?`}
        description={
          <>
            This deletes its {projects.length} {plural} and everything in them — datasets, documents,
            assets, members, tokens and webhooks:
            <span className="mt-2 block font-medium text-foreground">{projects.map((project) => project.name).join(', ')}</span>
            It cannot be undone.
          </>
        }
        confirmLabel={
          remove.pending
            ? `Deleting ${Math.min(attempted + 1, projects.length)} of ${projects.length}…`
            : 'Delete organization'
        }
        onConfirm={() => void confirm()}
        pending={remove.pending}
      />
    </>
  );
}
