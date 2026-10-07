"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, RefreshCwIcon } from "lucide-react";

import { ChecklistView } from "@/components/backends/checklist-view";
import { LogsView } from "@/components/backends/logs-view";
import { TablesView } from "@/components/backends/tables-view";
import { DeployAction } from "@/components/deploy/deploy-action";
import { EnvironmentCard } from "@/components/deploy/environment-card";
import { useDeploy, type DeployState } from "@/components/deploy/use-deploy";
import { DeployView } from "@/components/deploy/deploy-view";
import { useNameStage, useShell } from "@/components/console/state";
import { IconButton } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EnvTable } from "@/components/ui/env-table";
import { Tabs, useTabParam } from "@/components/ui/tabs";
import { BACKEND_TABS, runningFor } from "@/lib/backends";
import { relative } from "@/lib/format";
import type { BackendEnvView, DeploymentHistoryView, EnvironmentView } from "@/lib/types";

/**
 * One environment's backend: what went into it and what came out, what has been
 * deployed to it, and what it is saying.
 *
 * The environment is the **path**, not a dropdown. That is the same decision
 * `/frontends/<app>` makes and for the same reasons: a link to one environment's
 * backend can be sent to somebody, the back button returns to the list, and the
 * list keeps saying what every environment is doing while you read about one.
 * The five tabs below are that page's five views, in the order they are asked:
 * **is this environment ready** (Checklist — the things a person supplies), what
 * is in it and what came out (Env variables), what has been deployed to it, what
 * it is saying, and what it actually holds (DynamoDB tables — the one view that
 * reads the product's own rows rather than the deployment's account of itself).
 * Which one is showing is `?tab=` — in the URL, so that a reload and a link both
 * land on the same view, and `replace`d rather than `pushed` so the back button
 * still leaves the page rather than walking the strip.
 *
 * **The card under the chrome is the page's header.** The environment, its
 * state, the account it lands in, the five stacks and their condition are one
 * thing, and the console already draws that thing as `EnvironmentCard` — so a
 * hand-rolled heading here would be a second, drifting answer to "what is this
 * environment". It is drawn on every tab **except Deployments**: that tab is
 * `DeployView`, which draws the same card itself, and two of them on one screen
 * is one too many. The Deploy button above stays on every tab, because it is
 * what starts the run those tabs are about.
 *
 * There is deliberately no 404 here, unlike `/frontends/<app>`. The set of
 * frontends is four names the console knows; the set of environments is open,
 * and a stage nobody has configured yet is the one this console most needs a
 * page for — the Deployments tab is how it stops not existing.
 */
export function BackendView({ stage }: { stage: string }) {
  const { state, runs, refreshRuns } = useShell();
  const nameStage = useNameStage();
  // The tab lives in the URL rather than in this component: `?tab=logs` is what a
  // reload, the back button and a link somebody is sent all have in common.
  const { tab, select } = useTabParam(BACKEND_TABS);

  const environment = state?.environments.find((item) => item.stage === stage) ?? null;
  /** Before the first read, nothing about this environment is known — not even whether it exists. */
  const reading = state === null;
  /** The run going against this environment, in either direction. */
  const running = runningFor(runs, stage);

  /**
   * This environment's run — one instance for the whole page.
   *
   * The header carries the Deploy button, and the Deployments tab draws the run
   * it starts, so the two have to be the *same* run: a hook per component would
   * be two streams, and pressing the button would leave the checklist behind it
   * waiting for a run it never hears about.
   */
  const deploy = useDeploy(stage);

  // The environment in the path becomes the environment the rest of the console
  // is looking at — the chip in the bar, and what a frontend would be started
  // against — so reading about `staging` and then opening Frontends does not
  // leave the two halves of the console pointing at different places.
  //
  // `useNameStage` rather than `setStage`: the stage here may be one the
  // repository has never heard of, and naming it is what makes it selectable
  // everywhere else instead of being reset to whatever the shell knew before.
  useEffect(() => {
    nameStage(stage);
  }, [nameStage, stage]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {/* The chrome: where you came from, and the one control the whole page
            exists to offer. `DeployAction` is the primary weight of the button —
            the list's rows offer `DeployButton`, small and secondary, for a run
            nobody on that screen is watching — and it is driven by this page's
            `useDeploy`, so the run it starts is the run the Deployments tab then
            streams. */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/backends"
            className="text-muted-foreground hover:text-foreground inline-flex w-fit items-center gap-1.5 text-xs transition-colors"
          >
            <ArrowLeftIcon className="size-3.5" />
            Backends
          </Link>

          <div className="ml-auto flex flex-col items-end gap-1">
            <DeployAction
              stage={stage}
              // The press, and then the console's own list of what is running:
              // the chip on the card comes from that list, and without the nudge
              // it would take its next scheduled read — up to fifteen seconds —
              // to say "deploying" about a run that is already going.
              onDeploy={() => {
                void deploy.start({ stage }).then(() => refreshRuns());
              }}
              busy={deploy.starting}
              disabled={running !== null}
              title={
                running
                  ? `A ${running.action === "destroy" ? "delete" : "deploy"} is already running against ${stage}`
                  : `Deploy ${stage} — the same plan the Deployments tab runs`
              }
            />
            {/* The refusal goes beside the button that produced it. On the
                Deployments tab the page's own banner says the same thing, and
                one sentence twice is worse than once. */}
            {deploy.error && tab !== "deployments" ? (
              <span className="text-destructive max-w-64 text-right text-xs">{deploy.error}</span>
            ) : null}
          </div>
        </div>

        {tab === "deployments" ? null : (
          <EnvironmentCard
            stage={stage}
            environment={environment}
            state={state}
            activity={running?.action ?? null}
          />
        )}
      </div>

      <Tabs tabs={BACKEND_TABS} value={tab} onChange={select} />

      {tab === "checklist" ? <ChecklistView stage={stage} /> : null}
      {tab === "env" ? (
        <EnvTab stage={stage} environment={environment} reading={reading} />
      ) : null}
      {tab === "deployments" ? <DeploymentsTab stage={stage} deploy={deploy} /> : null}
      {tab === "logs" ? <LogsView stage={stage} /> : null}
      {tab === "tables" ? <TablesView stage={stage} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 1 — env variables
 * ------------------------------------------------------------------ */

function EnvTab({
  stage,
  environment,
  reading,
}: {
  stage: string;
  /** Null for a stage the repository has no config file for. */
  environment: EnvironmentView | null;
  /** ...and null for a stage nobody has read yet, which is not the same thing. */
  reading: boolean;
}) {
  const [env, setEnv] = useState<BackendEnvView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const configured = environment !== null;

  useEffect(() => {
    // Nothing to read without a config file, and the answer would be a table of
    // empty rows: what this environment needs is the checklist, not its outputs.
    if (reading || !configured) return;

    let cancelled = false;
    setEnv(null);
    setError(null);

    fetch(`/api/backends/${encodeURIComponent(stage)}/env`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { env?: BackendEnvView; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.env) {
          setError(body.error ?? "The environment could not be read.");
          return;
        }
        setEnv(body.env);
      })
      .catch(() => {
        if (!cancelled) setError("The environment could not be read.");
      });

    return () => {
      cancelled = true;
    };
  }, [stage, configured, reading]);

  if (reading) {
    return (
      <Card>
        <p className="text-muted-foreground text-sm">Reading the environment…</p>
      </Card>
    );
  }

  if (!configured) {
    return (
      <Card>
        <CardHeading
          title="No config file yet"
          hint={`${stage} has no infra/config/achar-${stage}.json. Nothing has read a config, so there is nothing to show — the Checklist tab is where one is written, and the Deployments tab is where it is deployed.`}
        />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-destructive text-sm">{error}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Two tables and no form. The values are *written* on the Checklist tab —
          the same fields, one place — and what this tab adds is the direction
          each one travels and who reads it, which is what makes a backend's
          variables different from a frontend's. */}
      <Card>
        <CardHeading
          title="Outputs"
          hint="What the deploy publishes. The first four are the values the four frontends are handed — a frontend's own variables are just these rows with a different name."
        />
        <div className="mt-5">
          {env ? (
            <EnvTable rows={env.outputs} emptyNote="This environment has not deployed yet." />
          ) : (
            <p className="text-muted-foreground text-xs">Reading the stacks…</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeading
          title="Inputs, as the deploy sees them"
          hint="The same values the Checklist tab writes, listed with where each one is read from and which part of the deployment consumes it."
        />
        <div className="mt-5">
          {env ? (
            <EnvTable rows={env.inputs} />
          ) : (
            <p className="text-muted-foreground text-xs">Reading the config…</p>
          )}
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 2 — deployments
 * ------------------------------------------------------------------ */

function DeploymentsTab({ stage, deploy }: { stage: string; deploy: DeployState }) {
  const [history, setHistory] = useState<DeploymentHistoryView | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/backends/${encodeURIComponent(stage)}/deployments`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { history?: DeploymentHistoryView };
        if (body.history) setHistory(body.history);
      })
      .catch(() => {
        // A missing history is not a broken page; the checklist still works.
      })
      .finally(() => setLoading(false));
  }, [stage]);

  useEffect(load, [load]);

  return (
    <div className="flex flex-col gap-6">
      {/* The checklist is the console's whole reason for existing, so it is
          rendered here rather than summarised — this tab *is* the deploy page,
          and the environment it runs against is the one in the URL. `embedded`
          is what tells it this is a tab and not a page of its own: the header
          above belongs to the page, and a second one here would be a second
          title for the same screen. DeployView draws the environment card
          itself, which is why the header above skips its own on this tab. */}
      <DeployView stage={stage} deploy={deploy} embedded />

      <Card>
        <CardHeading
          title="What CloudFormation has done"
          hint="Read from the stacks themselves, not from this process — so it survives the console restarting, and it goes back further than the last thing you ran."
          action={
            <IconButton onClick={load} title="Refresh" aria-label="Refresh">
              <RefreshCwIcon className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
            </IconButton>
          }
        />

        {history?.note ? (
          <p className="text-muted-foreground mt-4 text-xs">{history.note}</p>
        ) : null}

        <div className="mt-4 flex flex-col">
          {(history?.events ?? []).slice(0, 30).map((event, index) => (
            <div
              key={`${event.at}-${index}`}
              className="border-border/40 flex items-baseline gap-3 border-t py-2.5 text-xs first:border-t-0"
            >
              <span className="text-muted-foreground w-20 shrink-0 tabular-nums">
                {relative(event.at, Date.now())}
              </span>
              <Chip tone={statusTone(event.status)} className="shrink-0">
                {event.status}
              </Chip>
              <span className="min-w-0 flex-1">
                <span className="font-mono">{event.resource ?? event.stack}</span>
                {event.reason ? (
                  <span className="text-muted-foreground"> — {event.reason}</span>
                ) : null}
              </span>
            </div>
          ))}
          {!loading && (history?.events ?? []).length === 0 && !history?.note ? (
            <p className="text-muted-foreground text-xs">Nothing has been deployed here yet.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function statusTone(status: string) {
  if (status.endsWith("_FAILED")) return "bad" as const;
  if (status.includes("ROLLBACK")) return "warn" as const;
  if (status.endsWith("_COMPLETE")) return "ok" as const;
  if (status.endsWith("_IN_PROGRESS")) return "run" as const;
  return "muted" as const;
}
