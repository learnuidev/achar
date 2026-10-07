'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@achar/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@achar/ui';
import { useAction } from '@/hooks/use-resource';
import { routes } from '@/lib/routes';
import { slugify } from '@achar/schema';

/**
 * Making the first thing there is.
 *
 * A project is the collaboration boundary, so it is asked for as one: a name
 * for the thing being made content for, and an organization, which is who it
 * belongs to on paper rather than who is allowed in. The slug is shown as it is
 * typed, because it is what every URL and every query in the project will carry
 * and a slug nobody saw is a slug somebody renames a month later.
 *
 * The caller becomes the project's admin — that is the API's rule, not this
 * form's — and the dialog closes onto the project's own page rather than onto
 * the list, because a person who just made one wants the dataset form.
 *
 * `defaultOpen` is for the screen that is told to arrive with this form already
 * up — `/studio?view=new-project`, which is where onboarding hands over. It is
 * read once, on the first render, and not held: a dialog that followed the query
 * afterwards would reopen itself when somebody closed it.
 */
export function CreateProjectDialog({
  trigger,
  defaultOpen = false,
}: {
  trigger?: React.ReactNode;
  /** Open on the first render — how a URL asks this form to be up. */
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState('');
  const [organizationName, setOrganizationName] = useState('');

  const create = useAction(async (api, input: { name: string; organizationName: string }) => {
    return (await api.createProject(input)) as Project;
  });

  const trimmedName = name.trim();
  const trimmedOrganization = organizationName.trim();
  const canSubmit = trimmedName.length > 1 && trimmedOrganization.length > 1 && !create.pending;

  function reset() {
    setName('');
    setOrganizationName('');
    create.reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const project = await create.run({
      name: trimmedName,
      organizationName: trimmedOrganization,
    });

    if (!project) {
      toast.error(create.error ?? 'Could not create the project');
      return;
    }

    toast.success(`${project.name} is ready`, {
      description: 'Make a dataset next — that is what documents and assets belong to.',
    });
    setOpen(false);
    reset();
    router.push(routes.project(project.projectId));
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <PlusIcon />
            New project
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            A project is where datasets live and where people are given roles. You become its
            admin.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Content"
              autoFocus
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Its slug will be{' '}
              <span className="font-mono">
                {trimmedName ? `${slugify(trimmedName)}-9f2c41` : 'derived-from-the-name'}
              </span>
              . The suffix is what keeps two projects with the same name apart.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-organization">Organization</Label>
            <Input
              id="project-organization"
              value={organizationName}
              onChange={(event) => setOrganizationName(event.target.value)}
              placeholder="Acme Inc."
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Who the project belongs to. Nothing about access follows from it — the roster and the
              roles do that.
            </p>
          </div>

          {create.error && <p className="text-sm text-destructive">{create.error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
