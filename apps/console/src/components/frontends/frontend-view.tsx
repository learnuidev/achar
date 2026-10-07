"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  HammerIcon,
  PlayIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { SELF_APP, useServices } from "@/components/apps/use-services";
import { useShell } from "@/components/console/state";
import { StepList } from "@/components/deploy/step-list";
import { EnvironmentPicker } from "@/components/frontends/environment-picker";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Chip, Dot } from "@/components/ui/chip";
import { EnvTable } from "@/components/ui/env-table";
import { Prose } from "@/components/ui/prose";
import { Tabs, useTabParam } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { apiHost, relative } from "@/lib/format";
import { STATUS, frontendOf, isLive } from "@/lib/frontends";
import type {
  AppKey,
  FrontendEnvView,
  LogLine,
  RunStatus,
  RunView,
  ServiceStatus,
  ServiceView,
} from "@/lib/types";

/**
 * One frontend: what it reads, what it builds to, and what it is saying.
 *
 * The three tabs are the three questions anybody has about one of these apps, and
 * which one is showing is `?tab=` — the same parameter, and the same hook, as an
 * environment's tabs, so a reload and a link both land on the view somebody was
 * looking at. What is *not* a tab is the control that decides whether it runs at
 * all: the environment and the start button sit above the strip, because starting
 * the app is the page's subject rather than one of its views, and a button that
 * lives inside the Output tab is a button you have to know to look for.
 *
 * The frontend itself is not a dropdown here either — it is a URL. The list on
 * `/frontends` is what picks one, and this page is about the one you picked.
 *
 * ## Where an app runs
 *
 * Two places, and both are on this machine: the dev server the console starts,
 * and the built output `next build` leaves in `apps/<app>/.next`. There is no
 * cloud frontend target, which is why the Build tab is a run with a checklist
 * rather than a deploy button — what it produces is a directory, and what it
 * proves is that the app compiles and which environment it was compiled for.
 */

const TABS = [
  {
    id: "env" as const,
    label: "Env variables",
    hint: "Every NEXT_PUBLIC_ACHAR_* this app reads, and the stack output each one is a copy of. Next substitutes these while building, so a built app has them frozen into the JavaScript it serves.",
  },
  {
    id: "build" as const,
    label: "Build",
    hint: "next build for this app, as a run: the directory and the file it is built from, the compiler, and what the build turned out to be.",
  },
  {
    id: "logs" as const,
    label: "Output",
    hint: "The dev server's output, straight from the process the console started — and a build's lines while one is going.",
  },
];

export function FrontendView({ app }: { app: AppKey }) {
  const frontend = frontendOf(app)!;
  const { stage } = useShell();
  // One stream for the page, passed down to the tabs that draw what it carries:
  // the hook opens an `EventSource` per use, and the control card and a tab each
  // asking for the same services would be two connections to say one thing.
  const { services, lines, occupied, pending, error, run, start, stop, build, cancelBuild } =
    useServices(app);
  // The tab is in the URL: `?tab=build` survives a reload, and it is a link
  // somebody can be sent. Same hook, same parameter as an environment's tabs.
  const { tab, select } = useTabParam(TABS);

  const isSelf = app === SELF_APP;
  const service = services.find((candidate) => candidate.app === app);
  const status = service?.status ?? "stopped";
  const live = isLive(status);
  // Before the first read, "stopped" is the absence of a fact rather than one —
  // a Start offered in that moment would race the port check on a server that is
  // already up.
  const known = services.length > 0;
  // A dev server started against one environment while the picker says another is
  // the one state worth naming: the next Start would move it, and nothing else on
  // the page says so.
  const drifted = live && service?.stage !== stage;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <Link
          href="/frontends"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs transition-colors"
        >
          <ArrowLeftIcon className="size-3.5" />
          Frontends
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{service?.name ?? frontend.label}</h1>
        <p className="text-muted-foreground text-sm">{service?.blurb ?? frontend.hint}</p>
      </header>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <EnvironmentPicker className="w-full sm:max-w-xs" />

          <div className="flex flex-wrap items-center gap-3">
            {isSelf ? (
              <Chip tone="accent">serving this page</Chip>
            ) : (
              <Chip tone={STATUS[status].tone}>
                <Dot tone={STATUS[status].tone} pulse={status === "starting"} />
                {STATUS[status].label}
              </Chip>
            )}

            {service ? (
              <a
                href={service.url}
                target="_blank"
                rel="noreferrer"
                title={`Open ${service.url}`}
                className={cn(
                  "border-border/70 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                  live || isSelf
                    ? "bg-card hover:bg-accent"
                    : "text-muted-foreground pointer-events-none opacity-50",
                )}
              >
                <span className="font-mono text-xs">:{service.port}</span>
                <ExternalLinkIcon className="size-3.5" />
              </a>
            ) : null}

            {isSelf ? null : live ? (
              <Button
                variant="danger"
                onClick={() => void stop(app)}
                busy={pending === app}
                icon={<SquareIcon className="size-3.5" />}
              >
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void start(app, stage)}
                busy={pending === app}
                disabled={!known}
                icon={<PlayIcon className="size-4" />}
              >
                Start on {stage}
              </Button>
            )}
          </div>
        </div>

        <div className="text-muted-foreground mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {isSelf ? (
            <span>
              The console is the process serving this page, so it is not started from here — see{" "}
              <span className="font-mono">server/services.ts</span> for the refusal in full.
            </span>
          ) : live ? (
            <>
              <span>
                against <span className="font-mono">{service?.stage ?? "its .env.local"}</span>
              </span>
              <span className="font-mono">{apiHost(service?.apiUrl)}</span>
            </>
          ) : (
            <span>
              Started from here with {stage}&rsquo;s values in the process environment — nothing on
              disk is rewritten, so <span className="font-mono">.env.local</span> stays as you left
              it.
            </span>
          )}
        </div>

        {drifted ? (
          <p className="text-warning mt-3 text-xs">
            Running against <span className="font-mono">{service?.stage ?? "its .env.local"}</span>{" "}
            — stop and start it to move it.
          </p>
        ) : null}

        {service?.adopted ? (
          <p className="border-border/40 mt-4 border-t pt-3 text-xs leading-relaxed">
            Adopted from an earlier console session — the dev server is still serving on port{" "}
            {service.port}, but its output went with the console that started it. Stop and start it
            again to get the transcript back.
          </p>
        ) : null}

        {service && !live && occupied.includes(service.port) ? (
          <p className="text-warning mt-4 flex items-start gap-2 text-xs">
            <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            Port {service.port} is already in use by something the console did not start.
          </p>
        ) : null}

        {status === "failed" && service?.error ? (
          <p className="text-destructive mt-4 text-xs">{service.error}</p>
        ) : null}

        {error ? <p className="text-destructive mt-4 text-xs">{error}</p> : null}
      </Card>

      <Tabs tabs={TABS} value={tab} onChange={select} />

      {tab === "env" ? <EnvTab app={app} stage={stage} /> : null}
      {tab === "build" ? (
        <BuildTab
          app={app}
          stage={stage}
          run={run}
          pending={pending === app}
          onBuild={() => void build(app, stage)}
          onCancel={() => void cancelBuild(app)}
        />
      ) : null}
      {tab === "logs" ? (
        <OutputTab stage={stage} app={app} lines={lines.get(app) ?? []} status={status} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 1 — env variables
 * ------------------------------------------------------------------ */

function EnvTab({ app, stage }: { app: AppKey; stage: string }) {
  const [env, setEnv] = useState<FrontendEnvView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setEnv(null);
    setError(null);

    fetch(`/api/frontends/${app}/env?stage=${encodeURIComponent(stage)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { env?: FrontendEnvView; error?: string };
        if (cancelled) return;
        if (!response.ok || !body.env) {
          setError(body.error ?? "The variables could not be read.");
          return;
        }
        setEnv(body.env);
      })
      .catch(() => {
        if (!cancelled) setError("The variables could not be read.");
      });

    return () => {
      cancelled = true;
    };
  }, [app, stage]);

  // What a person would paste into `apps/<app>/.env.local` is not this table: it
  // is `KEY=value`, one per line, which is what the file holds. A row with no
  // value is left out rather than pasted empty — `frontendEnvValues` leaves a key
  // out for the same reason, because an empty variable and an absent one are
  // different to an app, and the absent one is what this table is reporting.
  const set = (env?.rows ?? []).filter((row) => row.value);
  const unset = (env?.rows ?? []).filter((row) => !row.value).map((row) => row.key);
  const text = set.map((row) => `${row.key}=${row.value}`).join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Refused; the values are selectable in the table.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeading
          title={`${app} · ${stage}`}
          hint="Derived, not typed. Each of these is a stack output the console hands the app when it starts it — which is why starting an app against an environment rewrites nothing on disk."
          action={
            set.length ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copy()}
                title={`Copy all ${set.length} variables as KEY=value lines, as they would be written into apps/${app}/.env.local`}
                icon={
                  copied ? (
                    <CheckIcon className="text-success size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )
                }
              >
                {copied ? "Copied" : "Copy for .env.local"}
              </Button>
            ) : null
          }
        />
        <div className="mt-5">
          {error ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : env ? (
            <EnvTable rows={env.rows} />
          ) : (
            <p className="text-muted-foreground text-xs">Reading this environment&rsquo;s stacks…</p>
          )}
        </div>

        {unset.length ? (
          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            Left out of the copy: <span className="font-mono">{unset.join(", ")}</span> —{" "}
            {unset.length === 1 ? "it has" : "they have"} no value on {stage}, and writing{" "}
            {unset.length === 1 ? "it" : "them"} empty would only hide that: an app that finds a key
            set to nothing takes it as configured.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeading title="Where these values come from" />
        <div className="text-muted-foreground mt-4 flex flex-col gap-2 text-xs leading-relaxed">
          <p>
            <span className="text-foreground/80">NEXT_PUBLIC_ is inlined at build time.</span> Next
            substitutes these while compiling, so on a built app the value is frozen into the
            JavaScript a browser downloads. Changing the file does nothing until the app is built
            again — which is what the <span className="text-foreground/80">Build</span> tab is for,
            and why it shows which environment the build was compiled for.
          </p>
          <p>
            <span className="text-foreground/80">A dev server started here reads the process
            environment.</span>{" "}
            <span className="font-mono">@next/env</span> fills a key only when{" "}
            <span className="font-mono">process.env</span> does not already have it, so starting an
            app against an environment points it there without touching{" "}
            <span className="font-mono">.env.local</span> — and a file that says something else is
            not what the app is reading.
          </p>
          <p>
            <span className="text-foreground/80">The redirect URLs are not here.</span> The origins
            and callbacks Cognito accepts live on the user pool, not in this table — they are the
            environment&rsquo;s settings, and the checklist for a deployment is where they are
            written.
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tab 2 — the build
 * ------------------------------------------------------------------ */

/**
 * One `next build`, as a run.
 *
 * The checklist is the run's own steps rather than a spinner, because a build is
 * three questions and only the middle one is the compiler: is the app where the
 * console thinks it is and does its `.env.local` name this environment, does
 * `next build` succeed, and *is the result this environment's* — which no exit
 * code answers, because `NEXT_PUBLIC_*` was substituted while compiling.
 *
 * What the build prints is **not** drawn here. Every app's stream is one stream —
 * the dev server's lines and a build's together — so the lines arrive in the
 * Output tab, and what stays here is what each step reported, which survives a
 * reload. The sentence at the bottom of the card says so rather than leaving
 * somebody to wonder where the compiler went.
 */
function BuildTab({
  app,
  stage,
  run,
  pending,
  onBuild,
  onCancel,
}: {
  app: AppKey;
  stage: string;
  run: RunView | null;
  pending: boolean;
  onBuild: () => void;
  onCancel: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  const steps = run?.steps ?? [];
  const running = run?.status === "running";
  const settled = steps.filter((step) =>
    ["passed", "skipped", "warned", "manual"].includes(step.status),
  ).length;

  // The step being worked on, until somebody picks another one. A reader who
  // opened a finished step is not dragged away by the next event.
  const active = steps.find((step) => step.status === "running")?.id ?? null;
  const selectedId =
    chosen ?? active ?? steps.find((step) => step.status !== "pending")?.id ?? null;
  const selected = steps.find((step) => step.id === selectedId) ?? null;

  // A run against another environment is the one state worth naming: the
  // checklist on screen is not what this page's Build button would produce.
  const elsewhere = run && run.stage !== stage ? run : null;

  return (
    <Card>
      <CardHeading
        title="Build"
        hint={`next build in apps/${app}, with ${stage}'s five variables inlined as it compiles.`}
        action={
          steps.length > 0 ? (
            <Chip
              tone={running ? "run" : settled === steps.length ? "ok" : "muted"}
              monospace
              className="shrink-0"
            >
              {settled} / {steps.length}
            </Chip>
          ) : null
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={onBuild}
          busy={pending}
          disabled={running}
          icon={<HammerIcon className="size-4" />}
        >
          {running ? "Building…" : `Build on ${stage}`}
        </Button>

        {running ? (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}

        {run && !running ? (
          <span className="text-muted-foreground text-xs">
            {runStatusText(run.status)} ·{" "}
            {relative(run.finishedAt ?? run.startedAt, Date.now())} · against{" "}
            <span className="font-mono">{run.stage}</span>
          </span>
        ) : null}
      </div>

      {elsewhere ? (
        <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
          That build was for <span className="font-mono">{elsewhere.stage}</span>, not{" "}
          <span className="font-mono">{stage}</span> — pressing Build runs it again for the
          environment above.
        </p>
      ) : null}

      {steps.length > 0 ? (
        <>
          <div className="bg-muted mt-6 h-1 overflow-hidden rounded-full">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                run?.status === "failed"
                  ? "bg-destructive"
                  : settled === steps.length
                    ? "bg-success"
                    : "bg-run",
              )}
              style={{ width: `${steps.length > 0 ? (settled / steps.length) * 100 : 0}%` }}
            />
          </div>

          <div className="mt-3">
            <StepList steps={steps} selected={selectedId} onSelect={setChosen} />
          </div>
        </>
      ) : (
        <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
          Nothing has been built from this page yet. The run writes the five{" "}
          <span className="font-mono">NEXT_PUBLIC_ACHAR_*</span> keys into{" "}
          <span className="font-mono">apps/{app}/.env.local</span> for {stage}, runs{" "}
          <span className="font-mono">next build</span>, and reports which environment the build
          turned out to be — so it does touch that file, and it says so in its first step.
        </p>
      )}

      {selected ? (
        <div className="mt-5 border-border/40 border-t pt-4">
          <Prose text={selected.detail} className="text-muted-foreground text-xs" />
        </div>
      ) : null}

      {run?.status === "failed" && run.error ? (
        <div className="border-destructive/35 bg-destructive/10 mt-5 flex items-start gap-3 rounded-2xl border px-5 py-4">
          <TriangleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-destructive text-sm font-medium">The build stopped</p>
            <p className="text-muted-foreground mt-1 font-mono text-xs leading-relaxed">
              {run.error}
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-muted-foreground mt-5 text-xs leading-relaxed">
        What the build prints arrives in the{" "}
        <span className="text-foreground/80">Output</span> tab, beside the dev server&rsquo;s lines:
        the console keeps one stream per app, and a build is something this app is doing. The steps
        above keep what each one reported, which is what a reload finds.
      </p>
    </Card>
  );
}

function runStatusText(status: RunStatus): string {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "stopped";
    case "cancelled":
      return "cancelled";
    default:
      return "running";
  }
}

/* ------------------------------------------------------------------ *
 * Tab 3 — the output
 * ------------------------------------------------------------------ */

/**
 * The app's own output.
 *
 * One pane for two processes, because they write to one stream: a dev server the
 * console started, and a build it started beside it. The pane says which is
 * which only by what the lines themselves say — Next's banner names the command —
 * and pretending otherwise would mean a second connection to say the same thing.
 */
function OutputTab({
  stage,
  app,
  lines,
  status,
}: {
  stage: string;
  app: AppKey;
  lines: LogLine[];
  status: ServiceStatus;
}) {
  const live = isLive(status);
  const nothingYet = `Not running. Start ${app} on ${stage} above to point it at that environment without touching .env.local.`;

  return (
    <Card flush className="pb-4">
      <div className="flex items-center gap-3 px-6 pt-6">
        <h2 className="text-base font-semibold tracking-tight">Output</h2>
        <span className="text-muted-foreground text-xs">
          {lines.length ? `${lines.length} lines` : "nothing yet"}
        </span>
        {status === "starting" ? <Chip tone="run">starting</Chip> : null}
      </div>

      <div className="mt-4 max-h-96 overflow-auto px-6">
        {lines.length ? (
          lines.map((line) => (
            <div
              key={line.seq}
              className={cn(
                "py-0.5 font-mono text-xs break-all whitespace-pre-wrap",
                line.stream === "err" && "text-destructive/90",
                line.stream === "note" && "text-muted-foreground",
              )}
            >
              {line.text}
            </div>
          ))
        ) : (
          <p className="text-muted-foreground py-2 text-xs">{live ? "Waiting for output." : nothingYet}</p>
        )}
      </div>
    </Card>
  );
}
