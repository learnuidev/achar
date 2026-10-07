"use client";

import { useState } from "react";
import { TriangleAlertIcon, Trash2Icon, XIcon } from "lucide-react";

import { Button, IconButton } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Prose } from "@/components/ui/prose";
import type { EnvironmentView } from "@/lib/types";

/**
 * Deleting an environment, and why it is the one control that asks for typing.
 *
 * Everything else in this console is reversible by pressing another button. This
 * is not: it destroys the five CloudFormation stacks and removes
 * `infra/config/achar-<stage>.json`, which is what takes the environment out of
 * this console — and, if the tick is set, it deletes the data behind them: the
 * tables, the assets bucket and the objects in it, the distribution, and the
 * user pool with every account in it. What it can undo is nothing. So the
 * consequences are stated *before* the control, and the control asks for the
 * stage's name rather than a click. A button one slip away from the Deploy
 * button above it would be a bad trade for the two seconds typing costs.
 *
 * ## Why the data is a tick rather than the whole of the delete
 *
 * Because they are two different things to want, and only one of them is
 * recoverable. Deleting the stacks is how an experiment is cleaned up; deleting
 * the data is how an environment *ends*, and it takes the documents and the
 * assets with it. Every stateful resource this app creates is
 * `RemovalPolicy.RETAIN`, so the unticked run leaves the tables, the bucket, the
 * distribution and the pool in AWS with nobody managing them — which is exactly
 * what stops the next deploy of the same name at early validation, naming a
 * table or a bucket it cannot create. The tick is the second, and it is **off**
 * until somebody says otherwise: a run that was not asked to delete the data
 * cannot, because the steps that would are not in its plan.
 *
 * Two things make a delete this broad safe to have on a page at all, and both are
 * said here because they are what somebody deciding whether to press it needs to
 * know: the run **refuses to start** if another stage's config names any of these
 * resources — the tables, the bucket, the distribution or the pool — and its own
 * last step reads back whatever it could not take with it and whatever is still
 * pointed at where the environment was. The card describes neither outcome in
 * advance — the run does, from what is actually there.
 */
export function DestroyCard({
  stage,
  environment,
  reading,
  running,
  onDestroy,
}: {
  stage: string;
  /** Null for a stage the repository has no config file for. */
  environment: EnvironmentView | null;
  /**
   * Before the first read, `environment` is null for *every* stage — and "there
   * is no config file here" is the alarming half of that, so the card says
   * nothing about ownership until it knows.
   */
  reading: boolean;
  /** A run — a deploy or a delete — is going against this environment. */
  running: boolean;
  /**
   * Starts the destroy run, and answers with a refusal or null.
   *
   * The argument is the tick: whether this delete takes the data with it. It is
   * passed at the moment the button is pressed rather than held by the page,
   * because what the run does has to be what the box said at the second somebody
   * confirmed it.
   */
  onDestroy: (deleteData: boolean) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleteData, setDeleteData] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = typed.trim() === stage;

  const close = () => {
    setOpen(false);
    setTyped("");
    setDeleteData(false);
    setError(null);
  };

  const destroy = async () => {
    setBusy(true);
    setError(null);
    const refusal = await onDestroy(deleteData);
    setBusy(false);
    if (refusal) {
      setError(refusal);
      return;
    }
    // The run is going now; the checklist above is where it is watched from, and
    // this card has nothing left to offer until it finishes.
    close();
  };

  return (
    <Card className="border-destructive/25">
      <CardHeading
        title="Delete this environment"
        hint={`Destroys the five CloudFormation stacks — AcharDataStack-${stage}, AcharMediaStack-${stage}, AcharAuthStack-${stage}, AcharWebhookStack-${stage} and AcharApiStack-${stage} — and removes infra/config/achar-${stage}.json, which is what takes ${stage} out of this console. What happens to the data behind them is the tick below.`}
        action={
          open ? (
            <IconButton onClick={close} title="Cancel" aria-label="Cancel">
              <XIcon className="size-3.5" />
            </IconButton>
          ) : null
        }
      />

      <div className="mt-4 flex flex-col gap-3">
        <Prose
          className="text-muted-foreground max-w-3xl text-xs"
          text={
            `**The stacks go either way, and the config with them.** Every stateful resource here is ` +
            `\`RemovalPolicy.RETAIN\` — the ten tables, the assets bucket, the distribution and the ` +
            `user pool — so \`cdk destroy\` stops at the stacks and leaves the data in AWS with nobody ` +
            `managing it, which is why a redeploy of \`${stage}\` afterwards stops at early validation ` +
            `naming a table or a bucket it cannot create. The log groups are the exception: they are ` +
            `built to be destroyed, so they go with the stacks either way. ` +
            (reading
              ? `Reading this environment is what fills the rest of this card in: what it stands on, and ` +
                `what a delete would have to take with it.`
              : environment === null
                ? `There is no config file for this environment, so there is nothing here to delete — ` +
                  `but a redeploy of \`${stage}\` would run against whatever AWS still holds under that name.`
                : environment.ownsEverything
                  ? `This environment **creates** everything it stands on: ten tables named ` +
                    `\`achar-${stage}-*\`, its assets bucket, its distribution and its pool.`
                  : `This environment **imports** the tables, media and pool it stands on: the config ` +
                    `is the only thing that names them, and no deploy here can change them.`) +
            ` The tick below decides whether the data goes with the stacks. ` +
            `**Untick it** and the tables, the assets bucket, the distribution and the pool stay where ` +
            `they are, with the run's last step reading back what it left. **Tick it** and every one of ` +
            `them is deleted, one by one: the documents are gone, the assets are gone, and everybody ` +
            `who had an account here makes another one.`
          }
        />

        {running ? (
          <p className="text-muted-foreground border-border/40 flex items-start gap-2.5 border-t pt-4 text-xs leading-relaxed">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              A run is going against this environment right now — the checklist above is it. Deleting is
              refused until it finishes or is stopped, because two runs against one set of stacks do not
              compose.
            </span>
          </p>
        ) : open ? (
          <div className="border-border/40 flex flex-col gap-3 border-t pt-4">
            <label className="flex flex-col gap-2 text-xs" htmlFor="destroy-confirm">
              <span className="text-muted-foreground">
                This cannot be undone from here. Type{" "}
                <span className="text-foreground font-mono">{stage}</span> to confirm:
              </span>
              <input
                id="destroy-confirm"
                autoFocus
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") close();
                }}
                placeholder={stage}
                autoComplete="off"
                spellCheck={false}
                className="border-border/70 bg-background/60 focus-visible:ring-ring h-9 w-full max-w-xs rounded-full border px-4 font-mono text-sm focus-visible:ring-2 focus-visible:outline-none"
              />
            </label>

            {/* The one choice a delete has, and it is a tick rather than a second
                button because the two are the same operation with a different
                reach: the stacks go either way, and this is how far. */}
            <label className="flex max-w-3xl cursor-pointer items-start gap-2.5 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={deleteData}
                onChange={(event) => setDeleteData(event.target.checked)}
                className="accent-destructive mt-0.5 size-3.5 shrink-0"
              />
              <span className="text-muted-foreground">
                <span className="text-foreground font-medium">Delete the data as well</span> — the ten
                tables and every document in them, the assets bucket and every object in it, the
                CloudFront distribution that serves them, and the user pool with every account in it.
                Left unticked, all of that stays in AWS and the run reports what it left.
              </span>
            </label>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="danger"
                size="sm"
                busy={busy}
                disabled={!confirmed}
                onClick={() => void destroy()}
                icon={<Trash2Icon className="size-3.5" />}
              >
                {deleteData ? "Delete the stacks and the data" : "Delete the stacks"}
              </Button>
              <Button variant="ghost" size="sm" onClick={close}>
                Cancel
              </Button>
            </div>

            {error ? <p className="text-destructive text-xs">{error}</p> : null}
          </div>
        ) : (
          <div className="border-border/40 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              variant="danger"
              size="sm"
              disabled={reading || environment === null}
              onClick={() => setOpen(true)}
              icon={<Trash2Icon className="size-3.5" />}
            >
              Delete {stage}
            </Button>
            <span className="text-muted-foreground text-xs">
              {reading
                ? "Reading the environment…"
                : environment === null
                  ? "There is no config file for this environment, so there is nothing here to delete."
                  : "The stacks go. The data goes only if you tick the box."}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}
