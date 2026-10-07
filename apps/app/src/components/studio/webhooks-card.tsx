'use client';

import { useEffect, useState } from 'react';
import { ChevronRightIcon, Trash2Icon, WebhookIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Webhook, WebhookDelivery } from '@achar/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Switch,
  cn,
} from '@achar/ui';
import { EventBadge, ToneBadge } from '@/components/studio/badges';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorNote, ReadOnlyNote } from '@/components/ui/empty-state';
import { CreateWebhookDialog } from '@/components/studio/create-webhook-dialog';
import { useStudio } from '@/components/studio/studio-context';
import { useAction, type Resource } from '@/hooks/use-resource';
import { useDeliveries } from '@/hooks/use-tokens';
import { formatDateTime, relativeTime } from '@/lib/format';

/**
 * What this project notifies, and what happened when it did.
 *
 * The delivery history is behind a disclosure rather than drawn open, because it
 * is a second request per webhook and the answer a person comes here for is
 * usually "is this thing on and where does it point". Opening one row asks for
 * that one row's history, so a project with a dozen webhooks costs one request
 * until somebody wants to read one.
 *
 * A viewer may read all of this — the API answers the list to members — so the
 * difference drawn here is that the controls are absent rather than the card
 * being a note, which is the opposite of how tokens work one card up.
 */
export function WebhooksCard({
  webhooks,
  dataset,
  canEdit,
}: {
  webhooks: Resource<Webhook[]>;
  dataset: string;
  canEdit: boolean;
}) {
  const { projectId } = useStudio();
  const list = webhooks.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Webhooks</CardTitle>
          <CardDescription>
            A webhook tells a machine when content changed, by POSTing to a URL. The list is the
            project&rsquo;s, so one made on another dataset appears here too, tagged with the dataset
            it watches.
          </CardDescription>
        </div>
        {canEdit && (
          <CreateWebhookDialog
            projectId={projectId}
            dataset={dataset}
            onCreated={webhooks.refresh}
          />
        )}
      </CardHeader>

      <CardContent>
        {webhooks.error ? (
          <ErrorNote>{webhooks.error}</ErrorNote>
        ) : webhooks.loading && !webhooks.data ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<WebhookIcon className="size-5" />}
            title="No webhooks yet"
            description={
              <>
                A webhook is how a frontend finds out that content moved, instead of asking. It says
                nothing until a write matches it, and the <span className="font-mono">filter</span>{' '}
                is what makes it worth having: a webhook that fires on every write is one a frontend
                rebuilds its whole site for.
              </>
            }
            action={
              canEdit ? (
                <CreateWebhookDialog
                  projectId={projectId}
                  dataset={dataset}
                  onCreated={webhooks.refresh}
                />
              ) : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {!canEdit && (
              <ReadOnlyNote>
                Only an editor of this project can add or change a webhook. You can see what is
                subscribed and what it has been told.
              </ReadOnlyNote>
            )}

            {list.map((webhook) => (
              <WebhookRow
                key={webhook.webhookId}
                projectId={projectId}
                webhook={webhook}
                canEdit={canEdit}
                onChanged={webhooks.refresh}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One webhook: where it points, what it is told about, and whether it is on.
 *
 * The disclosure is a button around the name and the URL rather than around the
 * whole row, because the switch and the delete sit in that row too, and a control
 * within a control is a click that does two things.
 */
function WebhookRow({
  projectId,
  webhook,
  canEdit,
  onChanged,
}: {
  projectId: string;
  webhook: Webhook;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const remove = useAction(async (client, webhookId: string) => {
    await client.deleteWebhook(projectId, webhookId);
    return webhookId;
  });

  async function confirm() {
    const deletedId = await remove.run(webhook.webhookId);
    if (!deletedId) {
      toast.error(remove.error ?? 'Could not delete the webhook');
      return;
    }

    toast.success(`${webhook.name} deleted`, {
      description: 'Nothing in the dataset was touched — a webhook is a subscription, not content.',
    });
    setConfirming(false);
    onChanged();
  }

  return (
    <div className="rounded-xl border border-border">
      <div className={cn('px-3 py-3 transition-opacity', !webhook.enabled && 'opacity-60')}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            className="flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <ChevronRightIcon
              className={cn(
                'mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform',
                expanded && 'rotate-90',
              )}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{webhook.name}</span>
              <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                {webhook.url}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            <EnabledSwitch
              projectId={projectId}
              webhook={webhook}
              canEdit={canEdit}
              onChanged={onChanged}
            />
            {canEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setConfirming(true)}
                aria-label={`Delete ${webhook.name}`}
              >
                <Trash2Icon />
              </Button>
            )}
          </div>
        </div>

        {/* The badges sit outside the disclosure rather than inside it: a button
            may not contain the block elements a badge is drawn with, and a name
            that is a button is enough of a target for the row. */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
          <ToneBadge tone="neutral" className="font-mono">
            {webhook.dataset}
          </ToneBadge>
          {webhook.hasSecret ? (
            <ToneBadge tone="neutral">signed</ToneBadge>
          ) : (
            <ToneBadge tone="warning">unsigned</ToneBadge>
          )}
          {!webhook.enabled && <ToneBadge tone="neutral">out of service</ToneBadge>}
          {webhook.on.map((event) => (
            <EventBadge key={event} event={event} />
          ))}
          {webhook.on.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No events — this webhook is never called.
            </span>
          )}
        </div>

        {(webhook.filter || webhook.projection) && (
          <div className="mt-1.5 space-y-1 pl-6">
            {webhook.filter && <GroqLine label="filter" value={webhook.filter} />}
            {webhook.projection && <GroqLine label="projection" value={webhook.projection} />}
          </div>
        )}
      </div>

      {expanded && (
        <WebhookDeliveries projectId={projectId} webhookId={webhook.webhookId} />
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete ${webhook.name}?`}
        description={
          <>
            Achar stops POSTing to <span className="font-mono">{webhook.url}</span>, and the delivery
            history goes with it. Nothing in the dataset is deleted — this is the subscription to
            changes, not the changes.
          </>
        }
        confirmLabel="Delete webhook"
        onConfirm={() => void confirm()}
        pending={remove.pending}
      />
    </div>
  );
}

/** A GROQ fragment, labelled so that the label is not read as part of the query. */
function GroqLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-1.5 text-xs">
      <span className="shrink-0 text-muted-foreground/70">{label}</span>
      <span className="truncate font-mono text-muted-foreground" title={value}>
        {value}
      </span>
    </span>
  );
}

/**
 * The switch that takes a webhook out of service.
 *
 * The flip is drawn before the request answers, because a toggle that waits for a
 * round trip reads as broken, and it is put back where it was if the request
 * fails — the state on screen is the API's, and pretending otherwise after a
 * failure is the one thing a switch must not do.
 */
function EnabledSwitch({
  projectId,
  webhook,
  canEdit,
  onChanged,
}: {
  projectId: string;
  webhook: Webhook;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [enabled, setEnabled] = useState(webhook.enabled);

  const update = useAction(async (client, next: boolean) => {
    await client.updateWebhook(projectId, webhook.webhookId, { enabled: next });
    return next;
  });

  useEffect(() => {
    setEnabled(webhook.enabled);
  }, [webhook.enabled]);

  async function toggle(next: boolean) {
    setEnabled(next);
    const applied = await update.run(next);
    if (applied === null) {
      setEnabled(webhook.enabled);
      toast.error(update.error ?? 'Could not change the webhook');
      return;
    }

    toast.success(next ? `${webhook.name} is in service` : `${webhook.name} is out of service`);
    onChanged();
  }

  return (
    <Switch
      checked={enabled}
      onCheckedChange={(next) => void toggle(next)}
      disabled={!canEdit || update.pending}
      aria-label={`${webhook.name} in service`}
      title={canEdit ? 'Take it out of service, or put it back' : 'Only an editor can change this'}
    />
  );
}

/** What one webhook has been told, read when somebody opens the row. */
function WebhookDeliveries({ projectId, webhookId }: { projectId: string; webhookId: string }) {
  const deliveries = useDeliveries(projectId, webhookId);
  const list = deliveries.data ?? [];

  return (
    <div className="border-t border-border">
      <p className="bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
        Recent deliveries
      </p>

      {deliveries.error ? (
        <div className="p-4">
          <ErrorNote>{deliveries.error}</ErrorNote>
        </div>
      ) : deliveries.loading && !deliveries.data ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-6 w-full rounded-md" />
          <Skeleton className="h-6 w-5/6 rounded-md" />
        </div>
      ) : list.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          Nothing yet. A webhook is told about the next write that matches it, not about anything
          that happened before it existed — a new one with no deliveries is the normal state, not a
          fault.
        </p>
      ) : (
        <div className="divide-y divide-border">
          {list.map((delivery) => (
            <DeliveryRow key={delivery.deliveryId} delivery={delivery} />
          ))}
        </div>
      )}
    </div>
  );
}

/** One attempt: what it was for, when it was, and how it went. */
function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const succeeded = delivery.status === 'SUCCESS';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs">
      <EventBadge event={delivery.event} />
      <span className="max-w-64 truncate font-mono" title={delivery.documentId}>
        {delivery.documentId}
      </span>
      <span className="text-muted-foreground" title={formatDateTime(delivery.at)}>
        {relativeTime(delivery.at)}
      </span>
      <span className="text-muted-foreground">attempt {delivery.attempt}</span>
      <ToneBadge tone={succeeded ? 'success' : 'danger'}>
        {succeeded ? 'delivered' : 'failed'}
      </ToneBadge>
      <span className="tabular-nums text-muted-foreground">
        {delivery.statusCode ? `HTTP ${delivery.statusCode}` : 'no response'}
      </span>
      <span className="tabular-nums text-muted-foreground">{delivery.durationMs} ms</span>

      {delivery.error && (
        <p className="w-full break-words text-destructive">{delivery.error}</p>
      )}
    </div>
  );
}
