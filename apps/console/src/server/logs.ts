import type { BackendFunctionView, BackendLogs, LogEventView } from "@/lib/types";
import { awsJson } from "./aws";

/**
 * The backend's logs, read out of CloudWatch.
 *
 * Every Lambda here logs to `/aws/lambda/achar-<stage>-<key>` — the name is
 * derived rather than discovered, because `api-stack.ts` and `webhook-stack.ts`
 * both pass `functionName(stage, spec.key)` to their functions and declare the
 * log group with the same string; CloudWatch names the group after it, and the
 * one place that decides the name is `infra/src/naming.ts`.
 *
 * ## Why the list is log groups and not functions
 *
 * It was `lambda list-functions`, filtered by name in this process — and that
 * was **wrong in a way nothing said out loud**: the call is paginated
 * account-wide, so a stage's Lambdas were only listed if they happened to fall
 * in the first page. On an account that holds other people's functions, the
 * second half of the alphabet simply was not there to search for.
 *
 * `DescribeLogGroups` takes a **name prefix**, and the prefix is the stage: one
 * call, filtered by the service rather than by this process, and complete
 * whatever else the account holds. It is also the more honest source for this
 * tab, which reads logs and nothing else — a function the console has no log
 * group for is a function it cannot show you anything about. The trade is that a
 * function which has **never been invoked** has no log group unless its stack
 * declared one; here both stacks do declare them, so a function that has never
 * run is a row with a `0 B` group rather than a missing row.
 *
 * Each row also carries how many bytes of log data the group holds, which is
 * the one number this list can offer that nothing else can: it is how you find
 * the function that is filling CloudWatch up.
 *
 * ## Why one function at a time
 *
 * `FilterLogEvents` takes a *single* log group, and an environment has 39 of
 * them. Fanning out over all of them per request would be 39 API calls to draw
 * a screen, and Logs Insights — which does span groups — needs a query to be
 * started and polled, which is a different shape of interaction than "show me
 * what just happened".
 *
 * So the page asks which function first, defaulting to the ones that are event
 * driven and therefore the ones nobody sees working — `deliver-webhook`, which
 * is reached by a queue and not by a route, so a failure in it is invisible
 * everywhere except here.
 */

/**
 * The functions that never answer a request, and so have nowhere else to say
 * anything.
 *
 * `deliver-webhook` is the only one, and it is the only `FunctionSpec` in
 * `infra/src/generated/service.ts` with `queue: true` and no route: it is
 * deployed by `webhook-stack.ts`, invoked by SQS, and the event it reads is a
 * publish that has already been answered. A handler behind a route reports its
 * failure as a status code, and the caller sees it; this one reports it to a
 * queue nobody is watching — five failures and the message goes to the
 * dead-letter queue and the subscriber is simply never told. That is the silence
 * this list puts first.
 */
export const EVENT_DRIVEN = ["deliver-webhook"];

interface RawLogGroup {
  logGroupName?: string;
  storedBytes?: number;
  retentionInDays?: number;
}

/**
 * How many log groups are read in one go.
 *
 * The API answers fifty at a time and the CLI's own paginator walks the pages
 * inside this one process, so this is the ceiling on a stage's function count
 * rather than a page size — well above the 39 this repository deploys, and
 * there is no server-side way to ask for "all of them" that is cheaper.
 */
const MAX_GROUPS = 1000;

export async function backendFunctions(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<BackendFunctionView[]> {
  const logGroupPrefix = `/aws/lambda/achar-${stage}-`;

  const body = await awsJson<{ logGroups?: RawLogGroup[] }>(
    [
      "logs",
      "describe-log-groups",
      "--log-group-name-prefix",
      logGroupPrefix,
      "--max-items",
      String(MAX_GROUPS),
    ],
    { ...ctx, optional: true },
  ).catch(() => null);

  if (!body) return [];

  return (body.logGroups ?? [])
    .filter((group): group is RawLogGroup & { logGroupName: string } =>
      Boolean(group.logGroupName?.startsWith(logGroupPrefix)),
    )
    .map((group) => {
      const key = group.logGroupName.slice(logGroupPrefix.length);
      return {
        name: `achar-${stage}-${key}`,
        key,
        logGroup: group.logGroupName,
        storedBytes: group.storedBytes ?? 0,
        retentionDays: group.retentionInDays ?? null,
        /** Worth showing first: a function nothing calls has nothing to show. */
        eventDriven: EVENT_DRIVEN.includes(key),
      };
    })
    .sort((a, b) => {
      if (a.eventDriven !== b.eventDriven) return a.eventDriven ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
}

interface RawEvent {
  timestamp?: number;
  logStreamName?: string;
  message?: string;
}

/**
 * The two lines Lambda's runtime writes around every invocation.
 *
 * `START RequestId: … Version: $LATEST` and `END RequestId: …` say nothing the
 * page does not already know — the invocation's own line carries the same id,
 * and the report carries the outcome — and on a busy function they are about
 * forty per cent of a page. Excluding them is not cosmetic: the page holds 200
 * events, so a fifth of it being bookends is the difference between reading one
 * invocation and reading several.
 *
 * **Filtered in CloudWatch rather than hidden here**, so the slots are spent on
 * lines somebody can use. The syntax is two plain exclusion terms, which is the
 * documented way to say "must not contain"; the price is that a handler which
 * prints the literal word `START` in capitals loses that line too.
 */
const PLATFORM_LINES = ["-START", "-END"];

/** What one read of a function's logs is asked for. */
export interface LogQuery {
  /** The function, as `backendFunctions` returned it. */
  fn: BackendFunctionView;
  minutes?: number;
  /**
   * A CloudWatch filter pattern, passed through verbatim — the box that fills it
   * says so rather than pretending it is a plain substring.
   */
  pattern?: string;
  limit?: number;
}

/**
 * Recent events for one function.
 *
 * `filter-log-events` rather than `tail`: `tail` streams until interrupted, which
 * is a process per open browser tab and does not survive the console restarting.
 * A window is asked for, drawn, and asked for again — the page has a refresh, and
 * a live-ish poll is a decision the person makes rather than one the server makes
 * for them.
 *
 * A log group that does not exist is the normal state of a function nobody has
 * invoked yet, so it is reported as "nothing has run" rather than as an error.
 */
export async function recentLogs(
  query: LogQuery,
  ctx: { profile?: string; region?: string } = {},
): Promise<BackendLogs> {
  const { fn } = query;
  // The window arrives in a query string, so a value that is not a number of
  // minutes is the default rather than a `--start-time NaN` the CLI refuses —
  // the same rule `rangeFor` applies to the metrics window.
  const minutes =
    typeof query.minutes === "number" && Number.isFinite(query.minutes) && query.minutes > 0
      ? query.minutes
      : 60;
  const limit = query.limit ?? 200;
  const startTime = Date.now() - minutes * 60_000;

  const argv = [
    "logs",
    "filter-log-events",
    "--log-group-name",
    fn.logGroup,
    "--start-time",
    String(startTime),
    "--limit",
    String(limit),
    "--interleaved",
  ];
  // The platform's bookends are excluded from every read — see `PLATFORM_LINES`.
  argv.push(
    "--filter-pattern",
    [query.pattern?.trim(), ...PLATFORM_LINES].filter(Boolean).join(" "),
  );

  const body = await awsJson<{ events?: RawEvent[] }>(argv, { ...ctx, optional: true }).catch(
    () => null,
  );

  if (!body) {
    return {
      function: fn.name,
      logGroup: fn.logGroup,
      events: [],
      note: `No log group at ${fn.logGroup} — nothing has invoked this function in this environment.`,
    };
  }

  const events: LogEventView[] = (body.events ?? [])
    .map((event) => ({
      at: event.timestamp ?? 0,
      stream: event.logStreamName ?? "",
      // Lambda's own framing lines arrive as empty strings; they are not noise
      // worth a row.
      message: (event.message ?? "").replace(/\n$/, ""),
    }))
    .filter((event) => event.message.length > 0)
    .sort((a, b) => a.at - b.at);

  return {
    function: fn.name,
    logGroup: fn.logGroup,
    events,
    note: events.length
      ? null
      : `Nothing in the last ${minutes} minute${minutes === 1 ? "" : "s"}${
          query.pattern ? ` matching "${query.pattern}"` : ""
        }.`,
  };
}
