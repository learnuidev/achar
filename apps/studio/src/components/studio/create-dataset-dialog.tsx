'use client';

import { useState } from 'react';
import { DatabaseIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { Dataset } from '@achar/types';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@achar/ui';
import { useAction } from '@/hooks/use-resource';
import { slugify } from '@achar/schema';

/**
 * Making a dataset.
 *
 * The name is the only interesting decision, and it is not a display name: it is
 * the word that appears in every query, every URL and every client's
 * configuration — `production` rather than "Production". So it is normalized as
 * it is typed and shown as it will be stored, which is the difference between a
 * dataset somebody uses and one they rename the day after they make it.
 *
 * Visibility is asked for here rather than left to a setting later, because it
 * is the one property of a dataset that decides whether an anonymous reader with
 * a public token can query it — a question the person making it can answer and
 * the person finding it a month later cannot.
 */
export function CreateDatasetDialog({
  projectId,
  trigger,
  onCreated,
}: {
  projectId: string;
  trigger?: React.ReactNode;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');

  const create = useAction(
    async (client, input: { datasetName: string; visibility: 'PRIVATE' | 'PUBLIC' }) =>
      (await client.createDataset(projectId, input)) as Dataset,
  );

  const slug = slugify(name);
  const canSubmit = slug.length > 0 && !create.pending;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const dataset = await create.run({ datasetName: slug, visibility });
    if (!dataset) {
      toast.error(create.error ?? 'Could not create the dataset');
      return;
    }

    toast.success(`${dataset.datasetName} is ready`, {
      description: 'It starts with the default schema, so there are already types to author.',
    });
    setOpen(false);
    setName('');
    onCreated?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setName('');
          create.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <DatabaseIcon />
            New dataset
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New dataset</DialogTitle>
          <DialogDescription>
            A dataset is a content store inside this project. Two of them are two sets of documents
            and assets, not one set with a flag on it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="dataset-name">Name</Label>
            <Input
              id="dataset-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="production"
              autoFocus
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Stored as <span className="font-mono">{slug || 'production'}</span> — this is the word
              your queries will use.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="dataset-visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(next) => setVisibility(next === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE')}
            >
              <SelectTrigger id="dataset-visibility">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRIVATE">Private — a token is needed to read it</SelectItem>
                <SelectItem value="PUBLIC">Public — a public token may query it</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {create.error && <p className="text-sm text-destructive">{create.error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.pending ? <Loader2Icon className="animate-spin" /> : <DatabaseIcon />}
              Create dataset
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
