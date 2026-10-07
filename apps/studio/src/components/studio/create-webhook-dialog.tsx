'use client';

import { useState } from 'react';
import { CheckIcon, Loader2Icon, WebhookIcon } from 'lucide-react';
import { toast } from 'sonner';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@achar/types';
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
  Textarea,
  cn,
} from '@achar/ui';
import { ErrorNote } from '@/components/ui/empty-state';
import { useAction } from '@/hooks/use-resource';

/**
 * Making a webhook.
 *
 * The filter is the field that decides whether this is worth having, so it is
 * asked for here rather than left to an edit later: without one the URL is told
 * about every write of every type, and a frontend that rebuilds on every write
 * rebuilds its whole site for a typo. The events start at `publish` for the same
 * reason — a new webhook is narrow until somebody widens it.
 *
 * The dataset is not a field. A webhook watches one dataset, and the one that
 * matters is the one this screen is already open on; asking again would be
 * offering a way to get it wrong.
 */
export function CreateWebhookDialog({
  projectId,
  dataset,
  trigger,
  onCreated,
}: {
  projectId: string;
  dataset: string;
  trigger?: React.ReactNode;
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [on, setOn] = useState<WebhookEvent[]>(['publish']);
  const [filter, setFilter] = useState('');
  const [projection, setProjection] = useState('');
  const [secret, setSecret] = useState('');

  const create = useAction(
    async (
      client,
      input: {
        name: string;
        url: string;
        on: WebhookEvent[];
        filter?: string;
        projection?: string;
        secret?: string;
      },
    ) => client.createWebhook(projectId, { dataset, enabled: true, ...input }),
  );

  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  const urlHasScheme = /^https?:\/\//i.test(trimmedUrl);
  const canSubmit = trimmedName.length > 0 && urlHasScheme && on.length > 0 && !create.pending;

  function toggleEvent(event: WebhookEvent) {
    setOn((current) =>
      current.includes(event) ? current.filter((entry) => entry !== event) : [...current, event],
    );
  }

  function reset() {
    setName('');
    setUrl('');
    setOn(['publish']);
    setFilter('');
    setProjection('');
    setSecret('');
    create.reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const trimmedFilter = filter.trim();
    const trimmedProjection = projection.trim();
    const trimmedSecret = secret.trim();

    const created = await create.run({
      name: trimmedName,
      url: trimmedUrl,
      on,
      // Absent rather than empty: an empty string is a filter that matches
      // nothing, and a secret of `''` is a signature nobody can verify.
      ...(trimmedFilter ? { filter: trimmedFilter } : {}),
      ...(trimmedProjection ? { projection: trimmedProjection } : {}),
      ...(trimmedSecret ? { secret: trimmedSecret } : {}),
    });
    if (!created) return;

    toast.success(`${created.name} is listening`, {
      description: `${created.url} is POSTed to whenever ${on.join(', ')} happens in ${dataset}.`,
    });
    setOpen(false);
    reset();
    onCreated?.();
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
            <WebhookIcon />
            New webhook
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New webhook</DialogTitle>
          <DialogDescription>
            A webhook tells a machine that content changed, by POSTing to a URL of yours. This one
            watches the <span className="font-mono">{dataset}</span> dataset of this project.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="webhook-name">Name</Label>
            <Input
              id="webhook-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Site rebuild"
              autoComplete="off"
              autoFocus
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webhook-url">Where to POST</Label>
            <Input
              id="webhook-url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/hooks/achar"
              autoComplete="off"
              inputMode="url"
            />
            {trimmedUrl && !urlHasScheme ? (
              <p className="text-xs text-destructive">
                A URL here has to start with <span className="font-mono">http://</span> or{' '}
                <span className="font-mono">https://</span> — that is the scheme the delivery uses.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                A reachable address that answers a POST. Whatever it returns is what the delivery
                history records.
              </p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium leading-none">When</legend>
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((event) => (
                <EventToggle
                  key={event}
                  event={event}
                  selected={on.includes(event)}
                  onToggle={() => toggleEvent(event)}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {on.length === 0
                ? 'Turn on at least one — a webhook with no events is never called.'
                : 'It is called for each event that is on, and never for the others.'}
            </p>
          </fieldset>

          <div className="grid gap-2">
            <Label htmlFor="webhook-filter">Filter</Label>
            <Input
              id="webhook-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder='_type == "post"'
              autoComplete="off"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              GROQ that the document has to satisfy. Leave it empty and every write of every type is
              sent — which is how a frontend ends up rebuilding its whole site for one typo.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webhook-projection">Projection</Label>
            <Textarea
              id="webhook-projection"
              rows={2}
              value={projection}
              onChange={(event) => setProjection(event.target.value)}
              placeholder={'{ "slug": slug.current }'}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              GROQ shaping what is sent. Empty sends the whole document, which is usually more than
              a receiver reads and more than it should have.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="webhook-secret">Signing secret</Label>
            <Input
              id="webhook-secret"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              placeholder="Optional"
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              A shared secret the receiver can check a delivery against, so it can tell a request
              from Achar from one anybody else sent. It is stored with the webhook and never handed
              back.
            </p>
          </div>

          {create.error && <ErrorNote>{create.error}</ErrorNote>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {create.pending ? <Loader2Icon className="animate-spin" /> : <WebhookIcon />}
              Create webhook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** One event, as a button that is on or off — several of them are on at once. */
function EventToggle({
  event,
  selected,
  onToggle,
}: {
  event: WebhookEvent;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
        selected
          ? 'border-ring bg-accent text-accent-foreground'
          : 'border-border text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
      )}
    >
      <CheckIcon className={cn('size-3.5', !selected && 'opacity-0')} />
      {event}
    </button>
  );
}
