"use client";

import Link from "next/link";
import { ArrowRightIcon, RefreshCwIcon, TerminalIcon, TriangleAlertIcon } from "lucide-react";

import { useShell } from "@/components/console/state";
import { DeployButton } from "@/components/backends/deploy-button";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Chip, Dot, Spinner } from "@/components/ui/chip";
import {
  backendBlurb,
  backendPath,
  backendState,
  runProgress,
  runningFor,
} from "@/lib/backends";
import { apiHost, plural, relative } from "@/lib/format";
import type { EnvironmentView, RunSummary } from "@/lib/types";

/**
 * The root: who you are, what every environment is, and the one button.
 *
 * ## Why this is a page rather than a redirect
 *
 * The console this was adapted from sends `/` to its list of environments,
 * because there the list is the whole subject: one backend, a row per stage, and
 * nothing worth putting above it. Here the console is opened to ask something
 * that is not about any one environment — *who am I acting as, and what is up* —
 * and a redirect throws that answer away. The two failures that make every other
 * number on the screen meaningless are both about the identity: no credentials at
 * all, and credentials for an account that is not the one these config files
 * name. Neither is visible in a list of stack counts.
 *
 * So the root is a summary, and deliberately **not a second opinion**: every
 * environment here carries the same verdict the list gives it (`backendState`),
 * the same stack count and the same `DeployButton`, so a stage that says
 * "deployed" here says it on `/backends` and on its own page too. What this page
 * adds is the identity above the rows and the runs in flight.
 *
 * `useShell()` is where the state comes from, which is why this page is a client
 * component: the shell read it once for the whole console, and a page that
 * fetched `/api/state` itself would be a second read that can disagree.
 */
export default function RootPage() {
  const { state, error, loading, refreshing, refresh, stages, runs, refreshRuns } = useShell();

  const environments = state?.environments ?? [];
  // What has an environment is the state; what does not is something somebody
  // named in this session and has not created yet. The shell's `stages` is the
  // only list either can come from — `ConsoleState.suggestions` is deliberately
  // always empty, because a stage with no config file is not something the
  // *server* can enumerate: naming one is a decision made on the page that
  // deploys it.
  const unbuilt = stages.filter(
    (stage) => !environments.some((environment) => environment.stage === stage),
  );

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Achar</h1>
          <p className="text-muted-foreground text-sm">
            The control room. It deploys the backend into an environment, starts the four
            frontends, and reads what AWS holds.
          </p>
        </div>

        <Button
          variant="secondary"
          onClick={refresh}
          busy={refreshing}
          icon={<RefreshCwIcon className="size-4" />}
        >
          Read it again
        </Button>
      </header>

      {error ? (
        <div className="border-destructive/35 bg-destructive/10 text-destructive flex items-start gap-3 rounded-3xl border px-5 py-4 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">{error}</p>
        </div>
      ) : null}

      {/* Who you are, first, because it is the one fact that decides whether the
          rest of this page means anything: every number below is in *this*
          account, in this region, and a console that drew them without saying
          whose they were would be a console somebody deploys to the wrong one
          from. */}
      <Card>
        <CardHeading
          title="Who this console acts as"
          action={
            <Link
              href="/integrations/aws"
              className="border-border/70 bg-card hover:bg-accent inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
            >
              The AWS integration
              <ArrowRightIcon className="size-3.5" />
            </Link>
          }
        />

        {loading && !state ? (
          <p className="text-muted-foreground mt-4 text-sm">Reading the account…</p>
        ) : state ? (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {state.identity ? (
                <Chip tone="ok" monospace>
                  <Dot tone="ok" />
                  {state.identity.account}
                </Chip>
              ) : (
                <Chip tone="warn">not signed in</Chip>
              )}
              <span className="text-muted-foreground font-mono text-xs">{state.region}</span>
              <span className="text-muted-foreground font-mono text-xs">
                profile {state.profile} · {state.profileSource}
              </span>
              <span className="text-muted-foreground ml-auto font-mono text-xs">
                {state.cli.installed ? (state.cli.version ?? state.cli.path) : "no aws CLI"}
              </span>
            </div>

            {state.identity ? (
              <p className="text-muted-foreground truncate font-mono text-xs" title={state.identity.arn}>
                {state.identity.arn}
              </p>
            ) : null}

            {/* An expired SSO session, a machine with no CLI on it and a profile
                for somebody else's account arrive as three different sentences,
                and the difference matters: one is a login, one is an install,
                and the third is neither. The integration page has the details —
                what this page owes the reader is the sentence itself. */}
            {state.identityError ? (
              <p className="text-muted-foreground flex gap-2.5 border-t border-border/40 pt-3 text-xs leading-relaxed">
                <TriangleAlertIcon className="text-warning mt-0.5 size-3.5 shrink-0" />
                <span>{state.identityError}</span>
              </p>
            ) : null}

            {/* Where the repository is, because everything this console runs —
                `cdk`, the bundler, the apps' `.env.local` — happens relative to
                it, and a checkout opened from somewhere unexpected is worth
                seeing before a deploy rather than after. */}
            <p className="text-muted-foreground flex items-center gap-2.5 border-t border-border/40 pt-3 font-mono text-xs">
              <TerminalIcon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate" title={state.repoRoot}>
                {state.repoRoot}
              </span>
            </p>
          </div>
        ) : null}
      </Card>

      {/* Anything going, above the list: a deploy somebody started in another tab
          is the reason a stack count below it looks wrong, and a page that said
          nothing about it would read as a broken environment. */}
      {runs.length > 0 ? (
        <div className="flex flex-col gap-2">
          {runs.map((run) => (
            <p
              key={run.id}
              className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-xs"
            >
              <Spinner tone={run.action === "destroy" ? "bad" : "run"} />
              <span className="text-foreground/80">{runProgress(run)}</span>
              <Link
                href={`${backendPath(run.stage)}?tab=deployments`}
                className="text-foreground/80 hover:text-foreground font-medium underline underline-offset-4"
              >
                Watch {run.stage}
              </Link>
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-base font-semibold tracking-tight">Environments</h2>
          <span className="text-muted-foreground text-xs">
            {loading && !state
              ? "reading…"
              : environments.length === 0
                ? "none yet"
                : plural(environments.length, "stage")}
          </span>
        </div>

        {environments.map((environment) => (
          <EnvironmentRow
            key={environment.stage}
            environment={environment}
            account={state?.identity?.account ?? null}
            loading={loading && !state}
            running={runningFor(runs, environment.stage)}
            onStarted={refreshRuns}
          />
        ))}

        {/* A stage with no config file is not an environment yet — it is a name
            the plan would write one for — and it is offered here with the same
            press the list gives it, because "deploy to a new environment" is how
            the first one starts. */}
        {unbuilt.map((stage) => (
          <Card key={stage} className="border-dashed">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-mono text-base font-semibold tracking-tight">{stage}</h3>
                  <Chip tone="muted">not created yet</Chip>
                </div>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  {backendBlurb(null)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`${backendPath(stage)}?tab=checklist`}
                  className="border-border/70 bg-card hover:bg-accent inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
                >
                  Checklist
                  <ArrowRightIcon className="size-3.5" />
                </Link>
                <DeployButton
                  stage={stage}
                  running={runningFor(runs, stage)}
                  onStarted={refreshRuns}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <p className="text-muted-foreground px-1 text-xs leading-relaxed">
        The list of environments, and the tabs each one has, is on{" "}
        <Link
          href="/backends"
          className="text-foreground/80 hover:text-foreground font-medium underline underline-offset-4"
        >
          Backends
        </Link>
        . The three apps are on{" "}
        <Link
          href="/frontends"
          className="text-foreground/80 hover:text-foreground font-medium underline underline-offset-4"
        >
          Frontends
        </Link>
        .
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * One environment
 * ------------------------------------------------------------------ */

/**
 * The same row the list draws, without the picker above it.
 *
 * It is a second copy of that markup rather than an import, and the reason is
 * that the two rows are not the same thing: the list's carries the run's own
 * step line and a link to watch it, because somebody on `/backends` is choosing;
 * this one says what the environment *is* and offers the press, because somebody
 * on `/` is checking. What must not differ between them is the verdict and the
 * button, and both come from the shared code.
 */
function EnvironmentRow({
  environment,
  account,
  loading,
  running,
  onStarted,
}: {
  environment: EnvironmentView;
  /** The account the console is acting as, so a stage in another one is named. */
  account: string | null;
  loading: boolean;
  running: RunSummary | null;
  onStarted: () => void;
}) {
  const status = backendState(environment, account, running?.action ?? null);
  const stacks = environment.stacks;
  const complete = stacks.filter((stack) => stack.healthy).length;
  const blurb = backendBlurb(environment);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold tracking-tight">
              <Link
                href={backendPath(environment.stage)}
                className="focus-visible:ring-ring group inline-flex items-center gap-1 rounded-sm font-mono hover:underline hover:underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
              >
                {environment.stage}
                <ArrowRightIcon className="text-muted-foreground group-hover:text-foreground size-4 transition-colors" />
              </Link>
            </h3>
            {loading ? null : (
              <Chip tone={status.tone}>
                {status.running ? <Spinner tone={status.tone} /> : <Dot tone={status.tone} />}
                {status.label}
              </Chip>
            )}
          </div>
          {blurb ? (
            <p className="text-muted-foreground mt-1.5 text-sm">{blurb}</p>
          ) : (
            /* An importing stage gets no blurb from `backendBlurb` — the fact
               belongs on its own tabs rather than repeated above every list —
               so the one line this row owes is which of the three groups it
               borrows rather than creates. */
            <p className="text-muted-foreground mt-1.5 text-sm">
              {environment.tables > 0
                ? `${plural(environment.tables, "imported table")} — shared with every other stage that imports them.`
                : "Imports the media and the pool it stands on rather than creating its own."}
            </p>
          )}
        </div>

        <DeployButton
          stage={environment.stage}
          running={running}
          onStarted={onStarted}
        />
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {running ? (
          <>
            <span className="text-foreground/80">{runProgress(running)}</span>
            <Link
              href={`${backendPath(environment.stage)}?tab=deployments`}
              className="text-foreground/80 hover:text-foreground font-medium underline underline-offset-4"
            >
              Watch it
            </Link>
          </>
        ) : (
          <span>
            {loading
              ? "Reading the stacks…"
              : stacks.length === 0
                ? "No stacks yet."
                : `${complete} of ${stacks.length} stacks complete.`}
          </span>
        )}

        {environment.apiUrl ? (
          <span className="truncate font-mono" title={environment.apiUrl}>
            {apiHost(environment.apiUrl)}
          </span>
        ) : null}

        {running ? (
          <span className="ml-auto">started {relative(running.startedAt, Date.now())}</span>
        ) : environment.account ? (
          <span className="ml-auto font-mono">
            {environment.account} · {environment.region}
          </span>
        ) : null}
      </div>
    </Card>
  );
}
