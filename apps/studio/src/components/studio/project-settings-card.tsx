'use client';

import { useEffect, useState } from 'react';
import { Loader2Icon, SaveIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '@achar/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@achar/ui';
import { ReadOnlyNote } from '@/components/ui/empty-state';
import { useAction } from '@/hooks/use-resource';
import { descriptionOf } from '@/lib/types';

/**
 * A project's name and description, which is the whole of what a project is that
 * is not its people or its content.
 *
 * The save button appears only when something has changed, and that is not a
 * flourish: this form PATCHes the project, and a form that offers to save
 * nothing invites a person to press it and wonder whether it did anything. An
 * admin sees the fields; everyone else sees the same two values as text, because
 * "who is this project for" is a question a viewer has too.
 */
export function ProjectSettingsCard({
  project,
  canAdmin,
  onSaved,
}: {
  project: Project;
  canAdmin: boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(descriptionOf(project));

  // The card is drawn from a read that can come back with a newer project —
  // after a save, or after somebody else renamed it — and fields left holding
  // the old value would offer to save it back over the new one.
  useEffect(() => {
    setName(project.name);
    setDescription(descriptionOf(project));
  }, [project]);

  const save = useAction(
    async (client, input: { name: string; description: string }) =>
      (await client.updateProject(project.projectId, input)) as Project,
  );

  const changed = name.trim() !== project.name || description !== descriptionOf(project);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!changed || save.pending) return;

    const updated = await save.run({ name: name.trim(), description });
    if (!updated) {
      toast.error(save.error ?? 'Could not save the project');
      return;
    }

    toast.success('Project updated');
    onSaved();
  }

  if (!canAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>The name and description every member sees.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="text-sm">{project.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Description</p>
            <p className="text-sm">{description || '—'}</p>
          </div>
          <ReadOnlyNote>Only an admin of this project can change its settings.</ReadOnlyNote>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settings</CardTitle>
        <CardDescription>
          Renaming the project does not change its slug — that is what every query and link already
          carries.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="project-description">Description</Label>
            <Textarea
              id="project-description"
              rows={3}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this project holds, and who it is for."
            />
          </div>

          {save.error && <p className="text-sm text-destructive">{save.error}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={!changed || save.pending}>
              {save.pending ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Save
            </Button>
            {changed && !save.pending && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
