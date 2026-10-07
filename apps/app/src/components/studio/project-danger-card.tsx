'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@achar/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@achar/ui';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useAction } from '@/hooks/use-resource';
import { routes } from '@/lib/routes';

/**
 * Ending a project, and everything inside it.
 *
 * A card of its own rather than a button beside Save, because the two are not the
 * same kind of act: a name can be typed back, and a cascade cannot. The counts on
 * it are the ones the page is already showing, so "everything inside it" is a
 * number rather than a phrase.
 *
 * Only an admin is given this, which is the rule the API enforces too — a viewer
 * offered a button that answers 403 has been taught something false about the
 * product.
 *
 * The delete itself is one request. The cascade is the API's — datasets,
 * documents, assets, schemas, tokens, webhooks and members, in the one order that
 * leaves nothing unreachable — and a client that walked it item by item would be
 * a client that could stop halfway.
 */
export function ProjectDangerCard({ project }: { project: Project }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const remove = useAction(async (client, projectId: string) => {
    await client.deleteProject(projectId);
    return true;
  });

  async function confirm() {
    const deleted = await remove.run(project.projectId);
    if (!deleted) {
      // A 404 is not a failure here: the project is gone, which is what was asked
      // for — somebody else's delete, or this button in another tab. Anything else
      // leaves the dialog open, because it is the only place the reason is on
      // screen and closing it would leave people looking at a project they were
      // told they had deleted.
      if (remove.status !== 404) {
        toast.error(remove.error ?? 'Could not delete the project');
        return;
      }
    }

    toast.success(`${project.name} deleted`);
    setOpen(false);
    // The page that was showing it is a 404 from here on, so the list is where
    // somebody who has just deleted a project wants to be.
    router.replace(routes.projectPicker());
  }

  const datasets = `${project.datasetCount} ${project.datasetCount === 1 ? 'dataset' : 'datasets'}`;
  const members = `${project.memberCount} ${project.memberCount === 1 ? 'member' : 'members'}`;

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="text-base">Delete this project</CardTitle>
          <CardDescription>
            Takes the project and everything under it: its datasets and the documents and assets
            they hold, its members, its API tokens and its webhooks. Nothing here is recoverable.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {datasets} · {members}
          </p>
          <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
            <Trash2Icon />
            Delete project
          </Button>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${project.name}?`}
        description={
          <>
            {datasets} and {members} go with it, and one of those members is you. Anybody using a
            token issued by this project will stop being able to read it. This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        onConfirm={() => void confirm()}
        pending={remove.pending}
      />
    </>
  );
}
