import { lastMeaningfulLines, run } from "./exec";
import { STACK_WORDS, type StackWord } from "@/lib/backends";
import type { AwsCliView, Identity, StackSummary } from "@/lib/types";

/**
 * The AWS CLI, as a typed function or two.
 *
 * The console talks to AWS the way every other script in this repository does —
 * through `aws`, with a `--profile` and a `--region` on every call — rather than
 * by taking an SDK as a dependency. Two reasons, and the second is the one that
 * decided it:
 *
 * - The profile is the unit of identity everywhere here. `cdk` takes it from
 *   `AWS_PROFILE`, and the handlers are deployed with it; an SDK client would
 *   need the credentials resolved a second way, and the two ways could disagree.
 * - Every call in this file is a `describe`, a `list` or a `get`. There is
 *   nothing to write, and a read is exactly what a CLI invocation is good at.
 *
 * The cost is honest and worth naming: an `aws` process takes about a second
 * before it says anything, so the page-level reads are batched into one call per
 * question (`snapshotAcharStacks` is one call for every environment) rather than
 * fanned out per row.
 */

export interface AwsContext {
  profile: string;
  region: string;
}

interface AwsOptions extends Partial<AwsContext> {
  /** A missing resource is an answer, not an error — return null instead. */
  optional?: boolean;
}

/** Runs `aws … --output json` and parses it. */
export async function awsJson<T>(
  argv: string[],
  options: AwsOptions = {},
): Promise<T | null> {
  const { profile, region, optional } = options;
  const args = [
    ...argv,
    ...(profile ? ["--profile", profile] : []),
    ...(region ? ["--region", region] : []),
    "--output",
    "json",
  ];

  // A CLI that is not installed throws rather than exiting non-zero, and for a
  // read that is the same answer as a resource that is not there.
  const result = await run("aws", args, { timeoutMs: 30_000 }).catch(() => null);

  if (!result || result.code !== 0) {
    if (optional) return null;
    const detail = result
      ? (result.stderr.trim() || result.stdout.trim()).split("\n").slice(-3).join("\n")
      : "the AWS CLI could not be started";
    throw new Error(`aws ${argv.slice(0, 3).join(" ")} failed:\n${detail}`);
  }

  const text = result.stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    if (optional) return null;
    throw new Error(`aws ${argv.slice(0, 3).join(" ")} did not answer with JSON.`);
  }
}

/* ------------------------------------------------------------------ *
 * Who we are
 * ------------------------------------------------------------------ */

/**
 * What `sts get-caller-identity` actually prints.
 *
 * PascalCase, because that is the AWS wire format — and deliberately a private
 * interface rather than `Identity` from `@/lib/types`, which is the camelCase
 * shape the browser reads. Conflating the two is what broke a deploy once, so
 * they are two types here and the conversion below is a line of code rather than
 * an act of faith.
 */
interface StsIdentity {
  UserId?: string;
  Account?: string;
  Arn?: string;
}

/**
 * The identity, converted at the boundary where the wire format is known.
 *
 * **`awsJson<T>` is an unchecked assertion** — it is `JSON.parse(text) as T`, and
 * TypeScript cannot tell a wrong `T` from a right one. So the conversion from
 * what the CLI prints to the shape the rest of this app expects has to be
 * written and executed, not merely declared: `Identity` declares `account`,
 * `arn` and `userId`, and the CLI answers with `Account`, `Arn` and `UserId`.
 *
 * `Account` and `Arn` are required *of the answer*: a value that is missing here
 * becomes a stack in the wrong account rather than a failed call.
 */
export async function getIdentity(ctx: Partial<AwsContext> = {}): Promise<Identity | null> {
  const response = await awsJson<StsIdentity>(["sts", "get-caller-identity"], {
    ...ctx,
    optional: true,
  });
  if (!response?.Account || !response.Arn) return null;

  return {
    account: response.Account,
    arn: response.Arn,
    userId: response.UserId ?? "",
  };
}

/**
 * Why the identity could not be read, in a sentence somebody can act on.
 *
 * The three failures are the same empty page otherwise: no CLI installed, a
 * profile with no credentials, and an SSO session that has lapsed all arrive as
 * an empty `sts` answer — and the first thing every page here does is ask who
 * the console is acting as. So the CLI's own words are read back and named,
 * because "expired token" and "command not found" want different responses from
 * the person reading them.
 */
export async function identityError(ctx: Partial<AwsContext> = {}): Promise<string> {
  const result = await run(
    "aws",
    [
      "sts",
      "get-caller-identity",
      ...(ctx.profile ? ["--profile", ctx.profile] : []),
      ...(ctx.region ? ["--region", ctx.region] : []),
    ],
    { timeoutMs: 30_000 },
  ).catch(() => null);

  if (!result) return "The AWS CLI could not be started. Is it on this machine's PATH?";

  const detail = (result.stderr || result.stdout).trim().split("\n").slice(-2).join(" ");
  if (/SSO|sso/i.test(detail)) {
    return `The AWS SSO session for '${ctx.profile ?? "default"}' has expired. Run \`aws sso login\` and refresh.`;
  }
  if (/credentials/i.test(detail)) {
    return `No credentials for profile '${ctx.profile ?? "default"}'. Run \`aws sso login\` or configure the profile.`;
  }
  return detail || "AWS credentials could not be resolved.";
}

/**
 * Which `aws` this machine has, if any.
 *
 * The AWS integration page's first row, and the thing the whole console is
 * useless without — so it is reported as a fact rather than as an error: a
 * checkout with no CLI still renders every page, and the page says which case it
 * is looking at.
 */
export async function awsCli(): Promise<AwsCliView> {
  const result = await run("aws", ["--version"], { timeoutMs: 20_000 }).catch(() => null);
  if (!result || result.code !== 0) return { installed: false, path: null, version: null };

  // `aws --version` writes to stderr: `aws-cli/2.15.0 Python/3.11.6 Darwin/…`.
  const text = `${result.stdout}${result.stderr}`.trim().split("\n")[0] ?? "";
  const version = /aws-cli\/(\S+)/.exec(text)?.[1] ?? (text || null);

  const which = await run("sh", ["-c", "command -v aws"], { timeoutMs: 10_000 }).catch(() => null);
  const path = which?.code === 0 ? which.stdout.trim() || null : null;

  return { installed: true, path, version };
}

/* ------------------------------------------------------------------ *
 * Stacks
 * ------------------------------------------------------------------ */

/**
 * The root stacks, and what each one is for.
 *
 * The purposes are deliberately neutral about importing: which of the first
 * three create their resources and which import them is `ownership` in the
 * environment's config. The environment card says which this one does.
 *
 * This list **is** "an environment" as far as the console is concerned: a
 * deploy's post-condition, a delete's, and the chip on a row all read it, so a
 * stack added to the CDK app and not added here is a stack the console will
 * happily report an environment as complete without. The words come from
 * `STACK_WORDS` in `lib/backends.ts`, because a client component draws a tile
 * per stack and cannot import this file to find out what they are.
 */
const STACK_PURPOSES: Record<StackWord, string> = {
  Data: "the ten DynamoDB tables",
  Media: "the assets bucket and the content CDN",
  Auth: "the Cognito user pool",
  Webhook: "the delivery queue and the function that empties it",
  Api: "the functions, their routes, and the IAM",
};

export const ROOT_STACKS = STACK_WORDS.map((suffix) => ({
  suffix,
  purpose: STACK_PURPOSES[suffix],
}));

export function rootStackNames(stage: string): string[] {
  return ROOT_STACKS.map(({ suffix }) => `Achar${suffix}Stack-${stage}`);
}

/**
 * A stack is only healthy if it is *settled*.
 *
 * `UPDATE_ROLLBACK_COMPLETE` ends in `_COMPLETE` and is the opposite of
 * healthy: it means the last change was rolled back and the stack is sitting in
 * the state it had before it. A check that matched `_COMPLETE` would call a
 * failed deploy a success, which is the one mistake this console must not make.
 */
const SETTLED = new Set(["CREATE_COMPLETE", "UPDATE_COMPLETE", "IMPORT_COMPLETE"]);

export function stackHealthy(status: string): boolean {
  return SETTLED.has(status);
}

export function stackLabel(status: string): string {
  if (stackHealthy(status)) return "complete";
  if (status === "UPDATE_ROLLBACK_COMPLETE") return "rolled back";
  if (status === "ROLLBACK_COMPLETE") return "rolled back";
  if (status.endsWith("_IN_PROGRESS")) return "in progress";
  if (status.endsWith("_FAILED")) return "failed";
  return status.toLowerCase().replace(/_/g, " ");
}

interface DescribeStacksResponse {
  Stacks?: Array<{
    StackName: string;
    StackStatus: string;
    Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
  }>;
}

export interface StackDetail {
  name: string;
  status: string;
  healthy: boolean;
  outputs: Record<string, string>;
}

/** One stack, with its outputs, or null when it does not exist yet. */
export async function describeStack(
  name: string,
  ctx: Partial<AwsContext> = {},
): Promise<StackDetail | null> {
  const response = await awsJson<DescribeStacksResponse>(
    ["cloudformation", "describe-stacks", "--stack-name", name],
    { ...ctx, optional: true },
  );
  const stack = response?.Stacks?.[0];
  if (!stack) return null;

  const outputs: Record<string, string> = {};
  for (const output of stack.Outputs ?? []) outputs[output.OutputKey] = output.OutputValue;

  return {
    name: stack.StackName,
    status: stack.StackStatus,
    healthy: stackHealthy(stack.StackStatus),
    outputs,
  };
}

export async function describeStacks(
  names: string[],
  ctx: Partial<AwsContext> = {},
): Promise<StackDetail[]> {
  const details = await Promise.all(names.map((name) => describeStack(name, ctx)));
  return details.filter((detail): detail is StackDetail => detail !== null);
}

interface DescribeAllResponse {
  Stacks?: Array<{
    StackName: string;
    StackStatus: string;
    Outputs?: Array<{ OutputKey: string; OutputValue: string }>;
  }>;
}

/**
 * A stack, with what its template exported.
 *
 * `describe-stacks` with no `--stack-name` returns every stack in the region
 * *with its outputs*, in one paginated call — which is the whole reason this is
 * one function rather than a `list-stacks` plus a `describe-stacks` per
 * environment. An `aws` process costs about a second before it says anything, so
 * asking five times for five environments is five seconds of a page that is
 * meant to settle instantly. Deleted stacks are not returned, so there is
 * nothing to filter out but the other people's stacks in the account.
 */
export interface CloudStack {
  name: string;
  status: string;
  healthy: boolean;
  nested: boolean;
  outputs: Record<string, string>;
}

export async function snapshotAcharStacks(
  ctx: Partial<AwsContext> = {},
): Promise<CloudStack[]> {
  const response = await awsJson<DescribeAllResponse>(["cloudformation", "describe-stacks"], {
    ...ctx,
    optional: true,
  });

  return (response?.Stacks ?? [])
    .filter((stack) => stack.StackName.startsWith("Achar"))
    .map((stack) => {
      const outputs: Record<string, string> = {};
      for (const output of stack.Outputs ?? []) outputs[output.OutputKey] = output.OutputValue;
      return {
        // CDK names a nested stack `<parent>-<LogicalId>-<hash>`; the hash is
        // what makes it unreadable, so the console keeps them but labels them.
        name: stack.StackName,
        status: stack.StackStatus,
        healthy: stackHealthy(stack.StackStatus),
        nested: /NestedStack/i.test(stack.StackName),
        outputs,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The root stacks of a stage, and whether all of them are settled. */
export function summariseStacks(
  stage: string,
  all: CloudStack[],
): { root: StackSummary[]; complete: number; deployed: boolean; partial: boolean } {
  const root = rootStackNames(stage).map((name) => {
    const found = all.find((stack) => stack.name === name);
    return found
      ? { name: found.name, status: found.status, healthy: found.healthy, nested: found.nested }
      : { name, status: "NOT_DEPLOYED", healthy: false, nested: false };
  });
  const complete = root.filter((stack) => stack.healthy).length;
  return {
    root,
    complete,
    deployed: complete === root.length,
    partial: complete > 0 && complete < root.length,
  };
}

/* ------------------------------------------------------------------ *
 * What is in the account
 * ------------------------------------------------------------------ */

interface ListBucketsResponse {
  Buckets?: Array<{ Name?: string; CreationDate?: string }>;
}

/**
 * The buckets this account holds whose name begins with a prefix.
 *
 * `list-buckets` has no prefix filter either, and unlike DynamoDB there is no
 * output to read the names out of — a bucket a stage creates is named by
 * CloudFormation when the config leaves `assetsBucketName` out, which is the
 * default, so the physical name exists only in `AcharMediaStack-<stage>`'s
 * `AssetsBucketName` output. What this answers is the account-wide question the
 * AWS integration page asks ("what does this repository have here"), which is a
 * different question from the one the tables tab asks, and the prefix is what
 * keeps the rest of the account out of the answer.
 */
export async function listBuckets(
  prefix: string,
  ctx: Partial<AwsContext> = {},
): Promise<string[]> {
  const response = await awsJson<ListBucketsResponse>(["s3api", "list-buckets"], {
    ...ctx,
    optional: true,
  });
  return (response?.Buckets ?? [])
    .map((bucket) => bucket.Name ?? "")
    .filter((name) => name.startsWith(prefix))
    .sort();
}

/** The last few lines of a failure, for a note that names what went wrong. */
export function failureLines(result: { stderr: string; stdout: string }, count = 4): string {
  const lines = lastMeaningfulLines(result.stderr || result.stdout, count);
  return lines.length ? lines.join(" · ") : "the command failed with no output";
}

interface ListTablesResponse {
  TableNames?: string[];
  LastEvaluatedTableName?: string;
}

/**
 * The tables this account holds whose name begins with a prefix.
 *
 * `list-tables` has no prefix argument, so the filter has to happen here — and it
 * is **paginated**, a hundred names at a time, which is the part that is easy to
 * miss and is the same bug `server/logs.ts` documents for `list-functions`: a
 * filter applied to the first page answers with whatever happened to be in it and
 * says nothing about the rest, which on a busy account is most of the answer. So
 * the cursor is followed to the end.
 *
 * This asks what the *account* holds, which is a different question from the one
 * the tables tab asks. Both matter: the tab wants the names a stack published,
 * and a delete wants what is actually there — including a table that outlived
 * the stack that named it, which is exactly the leftover the run has to report.
 */
export async function listTables(
  prefix: string,
  ctx: Partial<AwsContext> = {},
): Promise<string[]> {
  const names: string[] = [];
  let start: string | undefined;

  do {
    const page = await awsJson<ListTablesResponse>(
      [
        "dynamodb",
        "list-tables",
        ...(start ? ["--exclusive-start-table-name", start] : []),
      ],
      { ...ctx, optional: true },
    );
    for (const name of page?.TableNames ?? []) {
      if (name.startsWith(prefix)) names.push(name);
    }
    start = page?.LastEvaluatedTableName;
  } while (start);

  return names.sort();
}
