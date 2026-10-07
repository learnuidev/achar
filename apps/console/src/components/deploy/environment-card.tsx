"use client";

import { ShieldAlertIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Chip, Dot, type Tone } from "@/components/ui/chip";
import { backendState, STACK_WORDS } from "@/lib/backends";
import { cn } from "@/lib/cn";
import { apiHost, stackInitials, stackWord } from "@/lib/format";
import type { ConsoleState, EnvironmentView, RunAction, StackSummary } from "@/lib/types";

/**
 * The environment, and what a deploy here reaches.
 *
 * Everything the deploy is about, on one card: which stage, which account it
 * will land in, the root stacks and where each of them is, and what a deploy
 * here can and cannot touch. That last part is a paragraph rather than a
 * footnote on purpose — the surprising thing about an imported environment is
 * that it shares its tables and its bucket with every other stage that imports
 * them, and a console that hid that behind a tooltip would be hiding the single
 * fact an operator most needs before pressing a button that puts a second API
 * over `dev`'s database.
 *
 * `activity` is this *environment's* run, not the console's: another stage
 * deploying elsewhere leaves this card alone, because that is the whole point
 * of one run per environment. Which direction it is going is part of it — a card
 * that said "deploying" over a delete would be describing the opposite of what is
 * happening.
 */

export function EnvironmentCard({
  stage,
  environment,
  state,
  activity,
}: {
  stage: string;
  environment: EnvironmentView | null;
  state: ConsoleState | null;

  /** A run against this stage is going — possibly started in another tab. */
  activity: RunAction | null;
}) {
  const healthy = environment?.stacks.filter((stack) => stack.healthy).length ?? 0;
  // The same verdict the environment's row carries in the list: one function, so
  // a row that says "deployed" cannot sit above a card that says otherwise.
  const status = backendState(environment, state?.identity?.account ?? null, activity);
  // Before the first read, `environment` is null for *every* stage — so nothing
  // here may treat that as "there is no config file". The two are the same shape
  // and opposite meanings, and the wrong one is the alarming one.
  const reading = state === null;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="truncate font-mono text-2xl font-semibold tracking-tight">{stage}</h2>
            {reading ? null : (
              <Chip tone={status.tone}>
                <Dot tone={status.tone} />
                {status.label}
              </Chip>
            )}
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {reading
              ? "Reading the stacks…"
              : environment
                ? `account ${environment.account} · ${environment.region} · ${
                    environment.ownsEverything
                      ? "its own tables, media and pool"
                      : `${environment.tables} imported tables`
                  }`
                : "no config file yet — the plan writes one"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stackTiles(environment, reading).map((tile) => (
          <StackTile key={tile.name} tile={tile} />
        ))}
      </div>

      {environment?.apiUrl ? (
        <div className="text-muted-foreground mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/40 pt-4 font-mono text-xs">
          <span className="text-foreground/70">API</span>
          <span className="truncate" title={environment.apiUrl}>
            {apiHost(environment.apiUrl)}
          </span>
          {environment.cognitoDomain ? (
            <>
              <span className="text-border">·</span>
              <span className="truncate" title={environment.cognitoDomain}>
                {environment.cognitoDomain}
              </span>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-2.5 border-t border-border/40 pt-4">
        {reading ? null : environment?.ownsEverything ? (
          <p className="text-muted-foreground flex gap-2.5 text-xs leading-relaxed">
            <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              This environment <span className="text-foreground/80">creates everything</span>: its
              own ten tables, its own assets bucket and CloudFront distribution, its own Cognito
              user pool — all named <span className="font-mono">achar-{stage}-*</span>, all empty,
              and all retained if the stacks are deleted. Nothing is shared with another
              environment, so a deploy here cannot change what{" "}
              <span className="font-mono">dev</span> reads.
            </span>
          </p>
        ) : environment ? (
          <>
            <p className="text-muted-foreground flex gap-2.5 text-xs leading-relaxed">
              <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
              <span>
                The tables, the assets bucket, the CloudFront distribution and the Cognito user pool
                are <span className="text-foreground/80">imported</span> — CloudFormation will not
                change or delete one. A deploy here creates the{" "}
                <span className="text-foreground/80">
                  {healthy === 0 ? "five" : "environment's own"}
                </span>{" "}
                API, webhook queue, media roles and handlers, and it{" "}
                <span className="text-foreground/80">points at the same data</span> as every other
                stage that imports.
              </span>
            </p>

            {/* The consequence, stated once, because it is what the paragraph
                above costs: two environments importing the same tables are two
                APIs over one database, and the console is the only place that
                is visible before somebody writes through both. */}
            <p className="text-muted-foreground flex gap-2.5 text-xs leading-relaxed">
              <span
                className="mt-0.5 size-3.5 shrink-0 text-center font-mono leading-none"
                aria-hidden
              >
                ·
              </span>
              <span>
                A document written through this environment&rsquo;s API is a document{" "}
                <span className="font-mono">dev</span> reads, and an asset uploaded here is served
                from the same distribution. That is what a migrated stage is for, and it is also the
                reason a new environment creates its own.
              </span>
            </p>
          </>
        ) : (
          <p className="text-muted-foreground flex gap-2.5 text-xs leading-relaxed">
            <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              There is no config file for{" "}
              <span className="font-mono">{stage}</span> yet. The plan writes one on the way through
              — a <span className="text-foreground/80">new environment</span>, creating its own
              tables, media and user pool rather than importing another stage&rsquo;s.
            </span>
          </p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ *
 * The root stacks
 * ------------------------------------------------------------------ */

interface Tile {
  name: string;
  word: string;
  status: string;
  tone: Tone;
  exists: boolean;
}

function stackTiles(environment: EnvironmentView | null, reading: boolean): Tile[] {
  // `STACK_WORDS` rather than a list of words here: it is the same list the
  // plan's own post-condition and the destroy plan are built from, and a tile
  // drawn for a stack the run does not wait for — or the other way round — is
  // how a page ends up disagreeing with the run drawn beside it.
  return STACK_WORDS.map((word) => {
    const found: StackSummary | undefined = environment?.stacks.find(
      (stack) => stackWord(stack.name) === word,
    );
    if (reading || !found || found.status === "NOT_DEPLOYED") {
      return {
        name: `Achar${word}Stack`,
        word,
        status: reading ? "reading…" : "not deployed",
        tone: "muted",
        exists: false,
      };
    }
    return {
      name: found.name,
      word,
      status: found.healthy ? "complete" : found.status.toLowerCase().replace(/_/g, " "),
      tone: found.healthy ? "ok" : found.status.includes("IN_PROGRESS") ? "run" : "bad",
      exists: true,
    };
  });
}

function StackTile({ tile }: { tile: Tile }) {
  return (
    <div
      title={tile.name}
      className={cn(
        "border-border/60 bg-background/40 flex flex-col gap-1.5 rounded-2xl border px-3 py-3",
        !tile.exists && "border-dashed",
      )}
    >
      <div className="flex items-center gap-2">
        <Dot tone={tile.tone} pulse={tile.tone === "run"} />
        <span className="text-sm font-medium">{stackInitials(tile.word)}</span>
      </div>
      <span className="text-muted-foreground truncate text-xs">{tile.status}</span>
    </div>
  );
}
