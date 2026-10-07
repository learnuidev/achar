import { NextResponse } from "next/server";

import type { ShellState } from "@/components/console/state";
import type { EnvironmentView, StackSummary } from "@/lib/types";
import {
  awsCli,
  awsJson,
  getIdentity,
  identityError,
  listBuckets,
  snapshotAcharStacks,
  type AwsContext,
} from "@/server/aws";
import { consoleDefaults, environmentView, listStages } from "@/server/environments";
import { repoRoot } from "@/server/repo";

/**
 * Everything the console draws: who we are, what exists, and what is in the
 * account.
 *
 * Read-only, and it stays that way. Every call this makes is a `describe` or a
 * `list`, so opening the console — or leaving it open on a second monitor —
 * costs nothing and can never change anything. The one write in this app is the
 * deploy, and it is behind a button.
 *
 * It is one route rather than one per page because the AWS integration page's
 * subject is the same subject as the chrome's: the account this console acts on.
 * A route of its own would run the same `aws` processes a second time to answer
 * a page about the facts the chrome is already showing.
 *
 * ## Why there is a cache
 *
 * The calls behind this are `aws` processes, and an `aws` process is about a
 * second of Node starting up before it says anything. The page reads this on
 * mount, on every window focus and every thirty seconds, and a rail that takes
 * four seconds to redraw is a rail nobody trusts. Five seconds is short enough
 * that a deploy's stack statuses are still current by the time anybody looks,
 * and long enough that a page navigation is instant.
 *
 * ## Why nothing here can fail
 *
 * A control room that white-screens when the thing it controls is absent is
 * useless exactly when it is needed, and the state of a machine that has never
 * been set up is not an error — it is the first thing the page has to say. So
 * every read below is `optional`: a missing CLI, a profile with no credentials
 * and an account with no stacks all arrive as an empty answer and a sentence
 * beside it, never as a thrown request.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 5_000;

interface Cache {
  at: number;
  state: ShellState;
}

declare global {
  // eslint-disable-next-line no-var
  var __acharConsoleStateCache: Cache | undefined;
}

export async function GET(request: Request) {
  const fresh = new URL(request.url).searchParams.has("fresh");
  const cached = globalThis.__acharConsoleStateCache;

  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json(cached.state);
  }

  const { profile, profileSource, region } = consoleDefaults();
  const ctx: Partial<AwsContext> = { profile, region };

  // Together, not one after the other: these are six `aws` processes with
  // nothing to say to each other, and run in sequence the page would spend four
  // of its five seconds waiting for a process to start.
  const [cli, identity, stacks, tables, buckets] = await Promise.all([
    awsCli(),
    getIdentity(ctx),
    snapshotAcharStacks(ctx),
    listAccountTables(ctx),
    listBuckets("achar-", ctx),
  ]);

  // The identity read is allowed to fail — an expired SSO session is the most
  // likely thing anybody sees when they open this page — so the reason is
  // carried rather than thrown, and the chrome says it in a sentence instead of
  // rendering an error page. It is asked for last and only when it is needed,
  // because it is another `aws` process.
  const identityFailure = identity ? null : await identityError(ctx);

  const environments: EnvironmentView[] = listStages().map((stage) =>
    environmentView(stage, stacks, ctx),
  );

  // A stage is only interesting if it is deployable, deployed, or named dev. A
  // stray config file for a stage somebody abandoned is noise on a control
  // panel, and a stage named only in this session is not in the repository at
  // all — the rail adds that one itself.
  const known = environments.filter(
    (environment) =>
      environment.stage === "dev" ||
      environment.hasConfig ||
      environment.stacks.some((stack) => stack.status !== "NOT_DEPLOYED"),
  );

  const state: ShellState = {
    repoRoot: repoRoot(),
    profile,
    profileSource,
    region,
    cli,
    identity,
    identityError: identityFailure,
    environments: known,
    // Nothing is suggested here: a stage that has no config file yet does not
    // exist anywhere the *server* can read, and naming one is a decision made on
    // the page that deploys it, which tells the shell directly.
    suggestions: [],
    stacks: stacks.map(
      (stack): StackSummary => ({
        name: stack.name,
        status: stack.status,
        healthy: stack.healthy,
        nested: stack.nested,
      }),
    ),
    tables,
    buckets,
  };

  globalThis.__acharConsoleStateCache = { at: Date.now(), state };
  return NextResponse.json(state);
}

interface ListTablesResponse {
  TableNames?: string[];
}

/**
 * Every table in the account that is named for an Achar stage.
 *
 * `list-tables` here rather than `backendTables(stage, ctx)` from
 * `server/tables.ts`, and the difference is the question being asked. The AWS
 * page asks what the *account* holds — what a checkout has left behind in it,
 * including the tables of a stage whose config file is gone, which is exactly
 * the state somebody opens that page to understand. `backendTables` answers the
 * other question, per environment, and the tables tab is where it belongs.
 *
 * The filter is the name prefix because the CLI has no prefix argument for this
 * call. `achar-<stage>-<kebab-of-id>` is how `infra/src/naming.ts` builds every
 * one of them, so the prefix is both what identifies a table as this
 * repository's and the only part of the name that survives its stage.
 */
async function listAccountTables(ctx: Partial<AwsContext>): Promise<string[]> {
  const response = await awsJson<ListTablesResponse>(["dynamodb", "list-tables"], {
    ...ctx,
    optional: true,
  });

  return (response?.TableNames ?? []).filter((name) => name.startsWith("achar-")).sort();
}
