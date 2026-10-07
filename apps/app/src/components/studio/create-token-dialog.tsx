'use client';

import { useState } from 'react';
import { CircleAlertIcon, KeyRoundIcon, Loader2Icon } from 'lucide-react';
import { PROJECT_ROLES, type IssuedApiToken, type ProjectRole } from '@achar/types';
import {
  Button,
  Dialog,
  DialogClose,
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
  cn,
} from '@achar/ui';
import { CopyRow } from '@/components/ui/copy-row';
import { ErrorNote } from '@/components/ui/empty-state';
import { useDatasets } from '@/hooks/use-datasets';
import { useAction } from '@/hooks/use-resource';
import { roleDescription, roleLabel } from '@/lib/roles';

/**
 * `''` is not a value a Radix select item may carry, so "every dataset" is a
 * word here and is turned back into `null` — which is what the API reads as the
 * whole project — on submit.
 */
const EVERY_DATASET = 'every-dataset';

/**
 * Issuing a token, and handing over the secret the one time it exists.
 *
 * Two steps in one dialog, because the second is not optional: the API stores a
 * hash of the secret and nothing else, so a dialog that closed on success would
 * close on a credential nobody has. The reveal step is the whole point of the
 * flow, and its Done button is worded as the acknowledgement it is — the loss
 * happens at that click, not at some later accident.
 *
 * A new token starts at `VIEWER` rather than at the role the person issuing it
 * holds: a script that reads content is the ordinary case, and a key that begins
 * at the least it can be is one whose scope is widened on purpose.
 */
export function CreateTokenDialog({
  projectId,
  trigger,
  onIssued,
}: {
  projectId: string;
  trigger?: React.ReactNode;
  onIssued?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<ProjectRole>('VIEWER');
  const [scope, setScope] = useState(EVERY_DATASET);
  const [issued, setIssued] = useState<IssuedApiToken | null>(null);

  const datasets = useDatasets(projectId);
  const create = useAction(
    async (client, input: { name: string; role: ProjectRole; dataset: string | null }) =>
      client.createToken(projectId, input),
  );

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !create.pending;

  function reset() {
    setName('');
    setRole('VIEWER');
    setScope(EVERY_DATASET);
    setIssued(null);
    create.reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const created = await create.run({
      name: trimmed,
      role,
      dataset: scope === EVERY_DATASET ? null : scope,
    });
    // A failure is drawn under the fields rather than toasted, so the dialog the
    // person is already looking at is where the reason appears.
    if (!created) return;

    setIssued(created);
    onIssued?.();
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
            <KeyRoundIcon />
            Issue a token
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy this token now</DialogTitle>
              <DialogDescription>
                It is shown once, and this is that once. Closing this dialog without copying it is
                what loses it — the API keeps a hash, and neither this studio nor the API can produce
                the secret again.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              <CopyRow
                label={issued.name}
                value={issued.token}
                hint="Send it as a bearer token on every call."
              />

              <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3">
                <CircleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p className="text-xs text-muted-foreground">
                  There is no recovery. A token that is lost is revoked and issued again, and
                  anything still holding the old one starts failing on its next request. Paste it
                  somewhere it will live before you press Done.
                </p>
              </div>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button">Done — I have copied it</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Issue a token</DialogTitle>
              <DialogDescription>
                A token calls the content API from your own code, with no person signing in.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="token-name">What is it for?</Label>
                <Input
                  id="token-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Nightly build"
                  autoComplete="off"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  A name you will recognize in six months, when deciding which key to cut off.
                </p>
              </div>

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium leading-none">What it may do</legend>
                <div className="grid gap-2">
                  {PROJECT_ROLES.map((candidate) => (
                    <RoleOption
                      key={candidate}
                      role={candidate}
                      selected={role === candidate}
                      onSelect={() => setRole(candidate)}
                    />
                  ))}
                </div>
              </fieldset>

              <div className="grid gap-2">
                <Label htmlFor="token-dataset">What it reaches</Label>
                <Select value={scope} onValueChange={setScope}>
                  <SelectTrigger id="token-dataset">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EVERY_DATASET}>Every dataset</SelectItem>
                    {(datasets.data ?? []).map((dataset) => (
                      <SelectItem key={dataset.datasetName} value={dataset.datasetName}>
                        {dataset.datasetName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  A token scoped to one dataset is refused everything else in the project, which is
                  the usual answer for a frontend that reads only what it renders.
                </p>
              </div>

              {create.error && <ErrorNote>{create.error}</ErrorNote>}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {create.pending ? <Loader2Icon className="animate-spin" /> : <KeyRoundIcon />}
                  Issue token
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** One answer to "what may this token do", as a card you pick rather than a list you open. */
function RoleOption({
  role,
  selected,
  onSelect,
}: {
  role: ProjectRole;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors',
        selected ? 'border-ring bg-muted/50' : 'hover:bg-muted/40',
      )}
    >
      <input
        type="radio"
        name="token-role"
        checked={selected}
        onChange={onSelect}
        className="mt-0.5 size-4 shrink-0 accent-foreground"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium">{roleLabel(role)}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{roleDescription(role)}</span>
      </span>
    </label>
  );
}
