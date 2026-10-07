import fs from "node:fs";
import path from "node:path";
import type { LogStream, RunAction } from "@/lib/types";
import {
  awsJson,
  describeStack,
  describeStacks,
  getIdentity,
  identityError,
  listBuckets,
  listTables,
  rootStackNames,
  stackLabel,
} from "./aws";
import {
  configFile,
  configProblems,
  googleClientSecretName,
  listStages,
  newStageConfig,
  ownsEverything,
  pickSeedStage,
  readConfig,
  readFrontendEnv,
  stageOutputs,
  writeConfig,
  writeFrontendEnv,
  FRONTEND_ENV_KEYS,
  type StageConfig,
  type StageOutputs,
} from "./environments";
import { applyAuthUrls, googleSecretStatus } from "./settings";
import { cdkBin, repoPath, APPS, type AppDefinition } from "./repo";
import { display, lastMeaningfulLines, run, type PipedChild } from "./exec";

/**
 * The deploy plan: every step a stage needs, and how each one knows it is done.
 *
 * ## The shape of a step
 *
 * A step has a **check** and an **apply**. The check asks "is this already
 * true?" — and it is not a formality. `cdk bootstrap`, the config file and the
 * apps' `.env.local` files are all things that are done once and then stay done,
 * and a plan that simply ran them again would be a plan that lies about what it
 * did. So the check runs first, and when it is satisfied the step is a check mark
 * with the reason beside it; when it is not, the work runs.
 *
 * That is what makes a second press of the button cheap and honest: on an
 * environment that is already up, most of the plan reports *already satisfied*
 * and nothing is created. The steps that always run — the bundle, synth, the
 * deploy, the probe — are the ones where running again is free.
 *
 * ## Order
 *
 * The order is the order a first deployment actually needs, and two of the
 * positions are load-bearing:
 *
 * - the config file comes before the bootstrap, because it is what says which
 *   account to bootstrap in;
 * - the apps are pointed at the API *after* the stacks exist and *before* the
 *   API is probed, because a deploy nobody's frontend points at is not a
 *   deployment anybody can see — and because the `.env.local` files are what a
 *   person opens next.
 *
 * ## The eleven steps
 *
 * There is no `if` anywhere below on "is this a new environment". A new stage is
 * a stage whose config file does not exist yet, which is step three's check, and
 * everything else follows from the file: a stage that owns its tables gets them
 * created by the Data stack, and a stage that imports them named them in
 * `existing`. One plan, both cases, because a plan that branched would be two
 * plans to keep working.
 */

export interface StepContext {
  stage: string;
  profile: string;
  region: string;
  root: string;
  /** One line into the transcript, as it happens. */
  log: (stream: LogStream, text: string) => void;
  /** The one-line summary drawn beside the step's title while it runs. */
  progress: (note: string) => void;
  /** Values shared between steps: the identity, the outputs, the deployed set. */
  data: Record<string, unknown>;
  /** Hands the live process over, so cancelling the run can kill it. */
  owns: (child: PipedChild) => void;
  /**
   * Whether somebody has pressed Stop.
   *
   * A step that runs a command does not need this — the process is killed under
   * it and it returns a signal. A step that *waits* does: a CloudFront
   * distribution being disabled is polled until it is, and a run whose Stop
   * button took twenty minutes to be obeyed would be a run nobody can stop. The
   * loop asks this between polls.
   */
  stopped: () => boolean;
}

export interface StepOutcome {
  note: string;
  /**
   * Some work reports whether it had anything to do.
   *
   * The bundler and `cdk deploy` both print "nothing to do" as a *success*, and
   * both are run unconditionally because asking them whether there is work is
   * the same cost as doing it. Letting a step say so is what keeps the check
   * marks honest: a second run of an up-to-date environment shows a folded step
   * with the reason beside it, not a tick for work that did not happen.
   */
  status?: "passed" | "skipped";
}

export interface CheckOutcome {
  satisfied: boolean;
  note: string;
}

/**
 * The things two environments share, and the reason a step can be asked to wait.
 *
 * Two stages deploy side by side — they are different stacks, and each writes its
 * own cloud assembly — but a handful of steps are not about one stage at all:
 *
 * - **`checkout`** is this working tree. `infra/dist` is one bundle for every
 *   stage, and `apps/<app>/.env.local` is one file per app that can only name one
 *   environment at a time. Steps under this lock run one at a time, so a bundle
 *   is never written while another run's is being read, and a file is never
 *   half-written.
 * - **`account`** is the AWS account's own singletons: `CDKToolkit`, which is one
 *   stack per account and region however many environments there are.
 *
 * They are two names rather than one lock because they are two different
 * resources: a staging bootstrap should not hold up a dev bundle.
 */
export type LockName = "checkout" | "account";

export interface PlanStep {
  id: string;
  title: string;
  detail: string;
  optional?: boolean;
  /**
   * A step whose answer is somebody's decision, not the console's.
   *
   * Its check still runs and its note still reports what it found — but when the
   * check is not satisfied the step stops there rather than applying.
   */
  manual?: boolean;
  /** The line printed when a manual step lands on an answer that is not ours. */
  manualHint?: (ctx: StepContext) => string;
  /** What a satisfied check is called. Defaults to "Already done". */
  satisfiedLabel?: string;
  /** Milliseconds before `apply` is killed. */
  timeoutMs?: number;
  /**
   * The shared resource this step is about, so two runs never touch it at once.
   *
   * The lock is held across the step's check *and* its work: the two are one
   * judgement about one resource, and a check that read a bundle while another
   * run was writing it would be reading a different question than the one it
   * answered.
   */
  lock?: LockName;
  check?: (ctx: StepContext) => Promise<CheckOutcome>;
  apply: (ctx: StepContext) => Promise<StepOutcome>;
}

/* ------------------------------------------------------------------ *
 * Running things
 * ------------------------------------------------------------------ */

interface ExecOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Suppress the transcript, for a probe whose output is one number. */
  quiet?: boolean;
  /** Replaces the transcript, for output a step has to read as it arrives. */
  onLine?: (stream: LogStream, text: string) => void;
}

async function exec(
  ctx: StepContext,
  command: string,
  args: string[],
  options: ExecOptions = {},
) {
  if (!options.quiet && !options.onLine) ctx.log("note", `$ ${display(command, args)}`);

  return run(command, args, {
    cwd: options.cwd ?? ctx.root,
    // `cdk` takes its profile from the environment and has no `--profile` flag,
    // which is why the profile is set here rather than passed as an argument —
    // and why the same value is passed explicitly to every `aws` call.
    env: {
      AWS_PROFILE: ctx.profile,
      AWS_REGION: ctx.region,
      AWS_DEFAULT_REGION: ctx.region,
      STAGE: ctx.stage,
    },
    onLine: options.onLine ?? (options.quiet ? undefined : ctx.log),
    timeoutMs: options.timeoutMs,
    // Always owned, quiet or not: a process this console cannot kill is a
    // process that outlives it.
    onSpawn: ctx.owns,
    detached: true,
  }).catch((error: Error) => {
    throw new Error(`Could not start '${command}': ${error.message}`);
  });
}

/**
 * `cdk`, from `infra/`.
 *
 * **`cdk` finds `cdk.json` — and therefore the app — in the current working
 * directory and nowhere else.** It does not walk up, so running it from the
 * repository root fails with:
 *
 *     --app is required either in command-line, in cdk.json or in ~/.cdk.json
 *
 * which names neither the directory it looked in nor the file it wanted. Every
 * `cdk` invocation goes through here so that the directory is one decision made
 * once rather than three that have to agree.
 *
 * ## Why every invocation names its own assembly directory
 *
 * `cdk` synthesizes into `cdk.out` by default, and that directory is the whole of
 * what `deploy` reads: the templates, and the staged assets beside them. Two runs
 * sharing it would overwrite each other's templates, and the deploy that read the
 * other stage's assembly would report a diff for stacks it was not asked about —
 * a failure that names nothing and is not about anything being wrong. Since two
 * environments can be deployed at once, each writes `cdk.out/<stage>`.
 *
 * ## Why that directory is cleared before a synth
 *
 * **CDK never prunes an assembly.** Every synth stages the assets it just built
 * under a content hash and leaves whatever was there before, so a directory that
 * has been synthesized into a few times holds one copy of the handlers per
 * distinct build. Per environment that is a gigabyte kept per environment
 * forever, so this deletes the stage's own directory first: the run that needs it
 * is the run about to write it, `deploy` synthesizes before it deploys, and only
 * one run per stage can be going at a time. `bootstrap` reads no assembly, so it
 * is not worth the delete.
 */
async function cdk(ctx: StepContext, args: string[], options: Omit<ExecOptions, "cwd"> = {}) {
  const infra = repoPath("infra");
  if (!fs.existsSync(path.join(infra, "cdk.json"))) {
    throw new Error(`No cdk.json in ${infra} — that is the file that names the CDK app.`);
  }

  const output = path.join("cdk.out", ctx.stage);
  if (args[0] === "synth" || args[0] === "deploy") {
    fs.rmSync(path.join(infra, output), { recursive: true, force: true });
  }

  return exec(ctx, cdkBin(), [...args, "--output", output], { ...options, cwd: infra });
}

/** The last few lines of a failure, for a note that names what went wrong. */
function failureNote(result: { stderr: string; stdout: string }): string {
  const lines = lastMeaningfulLines(result.stderr || result.stdout, 4);
  return lines.length ? lines.join(" · ") : "the command failed with no output";
}

function assertOk(
  result: { code: number | null; timedOut: boolean; stderr: string; stdout: string },
  what: string,
  timeoutMs?: number,
): void {
  if (result.timedOut) {
    throw new Error(
      `${what} did not finish within ${Math.round((timeoutMs ?? 0) / 60_000)} minutes and was stopped.`,
    );
  }
  if (result.code !== 0) {
    throw new Error(`${what} failed — ${failureNote(result)}`);
  }
}

/**
 * The export CloudFormation refused to delete, when that is what failed.
 *
 * A cross-stack reference is a CloudFormation *export* — the API stack imports
 * the assets bucket, the pool and the queue, so the media and auth stacks export
 * them — and CloudFormation will not delete an export that another stack still
 * imports. So a change that *stops* exporting something, which is what replacing
 * a resource with a differently named one does, fails on the stack that owns it
 * with one of these two sentences. Both name the export, which is what
 * `exportReaders` needs.
 */
function refusedExportName(output: string): string | undefined {
  const patterns = [
    /Cannot delete export (\S+) as it is in use by/i,
    /Export (\S+) cannot be deleted as it is in use by/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(output);
    if (match) return match[1];
  }
  return undefined;
}

/**
 * The stacks of this stage that still import an export.
 *
 * Asked of CloudFormation rather than parsed out of the failure, because that
 * sentence truncates: past a couple of readers it says "(and 2 more)", and
 * `list-imports` answers with every one of them. Filtered to this stage's root
 * stacks, because the rest of the answer is the nested stacks those roots
 * create — and deploying a root deploys the nested stacks inside it.
 */
async function exportReaders(exportName: string, ctx: StepContext): Promise<string[]> {
  const answer = await awsJson<{ Imports?: string[] }>(
    ["cloudformation", "list-imports", "--export-name", exportName],
    { profile: ctx.profile, region: ctx.region, optional: true },
  );
  const deployable = new Set(rootStackNames(ctx.stage));
  return (answer?.Imports ?? []).filter((name) => deployable.has(name));
}

/**
 * CDK annotations — the one thing `synth` says that is worth reading.
 *
 * The resource-count warning and anything a construct raises arrive as
 * annotations on **stderr**, in the shape:
 *
 *     INFO Number of resources: 610 is approaching allowed maximum of 500 (Construct Annotations)
 *        AcharApiStack-dev/ApiRoutes
 *
 * They are the difference between a synth that merely produced templates and one
 * that validated the service, so the checklist quotes the first of them rather
 * than reporting "no warnings" over the top of one. The API stack is the one that
 * gets close: thirty-nine functions, ten tables and their indexes.
 */
function annotations(stderr: string): string[] {
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(?:INFO|WARNING|ERROR)\b/.test(line) && /Annotations?\)/i.test(line))
    .map((line) =>
      line
        .replace(/\s*\((?:Construct )?Annotations?\)\s*$/i, "")
        .replace(/^(?:INFO|WARNING|ERROR)\s+/i, ""),
    );
}

/* ------------------------------------------------------------------ *
 * Reading the repository
 * ------------------------------------------------------------------ */

/**
 * The origins the pool has to accept: the three apps a person signs in to.
 *
 * `apps/demo` is deliberately absent. It is a third-party client of the content
 * API — it authenticates with an API token, not with a Cognito session — so its
 * origin in a callback list would be a redirect Cognito would accept and no app
 * would ever ask for.
 */
function appOrigins(config: StageConfig | null): Array<{ app: AppDefinition; url: string }> {
  const mail = config?.mail;
  const named: Record<string, string | undefined> = {
    web: mail?.appBaseUrl,
    studio: mail?.studioBaseUrl,
    console: mail?.consoleBaseUrl,
  };

  return APPS.filter((app) => app.key !== "demo").map((app) => ({
    app,
    url: named[app.key] ?? `http://localhost:${app.port}`,
  }));
}

const SIGNING_IN_APPS = ["web", "studio", "console"] as const;

/* ------------------------------------------------------------------ *
 * The steps both plans share
 * ------------------------------------------------------------------ */

/**
 * The tools, and the one place a missing one is worth a sentence.
 *
 * Every step below is a process, and the failure without this check arrives as a
 * spawn error in the middle of a deploy: `spawn aws ENOENT` after the config file
 * has been written and before anything has been created, which reads like a
 * problem with the environment rather than with the machine.
 */
function toolchainStep(): PlanStep {
  return {
    id: "toolchain",
    title: "The tools are on this machine",
    detail:
      "Every step below is a process. This one asks whether `aws`, the workspace's `cdk` and a Node the repository will accept are actually here — because the failure that otherwise arrives is a spawn error in the middle of a deploy.",
    satisfiedLabel: "Present",
    check: async () => {
      const missing: string[] = [];

      const awsResult = await run("aws", ["--version"], { timeoutMs: 20_000 }).catch(() => null);
      const awsVersion =
        awsResult && awsResult.code === 0
          ? `${awsResult.stdout}${awsResult.stderr}`.trim().split("\n")[0]
          : null;
      if (!awsVersion) missing.push("the AWS CLI v2 is not on PATH");

      let cdkVersion: string | null = null;
      try {
        fs.accessSync(cdkBin(), fs.constants.X_OK);
        const manifest = JSON.parse(
          fs.readFileSync(repoPath("node_modules", "aws-cdk", "package.json"), "utf8"),
        ) as { version?: string };
        cdkVersion = `aws-cdk ${manifest.version ?? "unknown"}`;
      } catch {
        missing.push("the CDK CLI is missing — run `npm install` at the repository root");
      }

      const major = Number(process.versions.node.split(".")[0]);
      if (!Number.isFinite(major) || major < 20) {
        missing.push(`node ${process.versions.node} is too old — the repository asks for >= 20`);
      }

      if (missing.length > 0) return { satisfied: false, note: missing.join("; ") };
      return {
        satisfied: true,
        note: `${awsVersion} · ${cdkVersion} · node ${process.versions.node}`,
      };
    },
    apply: async () => {
      throw new Error(
        "The tools this plan needs are not all here. Install what is missing and run the plan again.",
      );
    },
  };
}

/**
 * The identity, and the account the environment claims.
 *
 * The mismatch check is the whole reason this is a step of its own. The stacks
 * take their account and region from `infra/config/achar-<stage>.json` rather
 * than from the ambient credentials, so a profile pointing somewhere else does
 * not fail until CDK refuses the first AWS call — halfway through a deploy, with
 * assets already uploaded to the wrong place.
 *
 * It is shared by both plans because it is one question asked in two directions,
 * and it matters more in one of them: a deploy in the wrong account creates
 * stacks nobody wanted, and a **destroy in the wrong account deletes somebody
 * else's environment**. So the sentence it refuses with names the direction it
 * was asked about.
 */
function credentialsStep(stage: string, action: RunAction): PlanStep {
  const stageConfigPath = path.relative(repoPath(), configFile(stage));
  const verb = action === "destroy" ? "Deleting" : "Deploying";

  return {
    id: "credentials",
    title: "This machine can act on the account",
    detail:
      "`aws sts get-caller-identity` with the profile this console was started with. The account it names has to be the one the environment's config names, because the stacks take their account and region from that file rather than from the credentials.",
    satisfiedLabel: "Verified",
    check: async (ctx) => {
      const identity = await getIdentity({ profile: ctx.profile, region: ctx.region });
      if (!identity) {
        return {
          satisfied: false,
          note: await identityError({ profile: ctx.profile, region: ctx.region }),
        };
      }
      ctx.data.identity = identity;

      const config = readConfig(ctx.stage);
      if (config?.account && config.account !== identity.account) {
        return {
          satisfied: false,
          note: `profile '${ctx.profile}' is account ${identity.account}, but ${stageConfigPath} names ${config.account}`,
        };
      }
      if (config?.region && config.region !== ctx.region) {
        return {
          satisfied: false,
          note: `${stageConfigPath} names region ${config.region}, this console is reading ${ctx.region}`,
        };
      }

      return { satisfied: true, note: `${identity.arn} · account ${identity.account}` };
    },
    apply: async (ctx) => {
      const identity = await getIdentity({ profile: ctx.profile, region: ctx.region });
      if (!identity) {
        throw new Error(await identityError({ profile: ctx.profile, region: ctx.region }));
      }
      const config = readConfig(ctx.stage);
      if (config?.account && config.account !== identity.account) {
        throw new Error(
          `Refusing to continue: profile '${ctx.profile}' resolves to account ${identity.account}, ` +
            `and ${stageConfigPath} says this environment is account ${config.account}. ` +
            `${verb} here would act on the wrong account's stacks.`,
        );
      }
      return { note: `${identity.arn} · account ${identity.account}` };
    },
  };
}

/* ------------------------------------------------------------------ *
 * The deploy plan
 * ------------------------------------------------------------------ */

export function buildPlan(stage: string): PlanStep[] {
  const stageConfigPath = path.relative(repoPath(), configFile(stage));

  /**
   * The config file, and the one step that makes "a new environment" mean
   * something.
   *
   * A stage that already has a file skips this. For a stage that does not there
   * are exactly two cases, and they are not interchangeable:
   *
   * - **A deployed stage whose file is missing.** The resources are real and
   *   already there, so the documented path applies: `import-state.mjs` reads
   *   them out of AWS and writes their physical names. This is the only case in
   *   which a stage imports anything, and the config says so afterwards.
   *
   * - **A stage that has never existed.** There is nothing to discover and
   *   nothing to import. The file is written with `ownership` set for all three
   *   groups, which is what tells the stacks to **create** the tables, the bucket,
   *   the distribution and the user pool rather than reach for somebody else's.
   *   Everything created is this stage's own, is empty, and is retained if the
   *   stack is deleted.
   *
   * The difference between the two is the difference between *a second deployment
   * of dev's data* and *a new environment*. Seeding a new stage from `dev`'s file
   * would copy its ten physical table names along with it — which reads like a new
   * environment and behaves like a second front door to the same database. This
   * step does not do that.
   *
   * What *is* carried over is the settings that are product configuration rather
   * than per-environment state: the mail addresses, the Google client id and the
   * callback and logout URLs. Those are the same product in every environment, and
   * a stage that invented its own would be a stage whose sign-in redirects
   * nowhere.
   */
  const config: PlanStep = {
    id: "config",
    title: "The environment's resources are named",
    detail: `\`${stageConfigPath}\` is what the stacks stand on. A stage that already exists imports the tables, the bucket, the distribution and the pool by physical name — \`import-state.mjs\` reads them out of AWS and writes them down. A **new** stage has no such names and is written to create all of them instead: the tables named \`achar-<stage>-*\`, the assets bucket named by CloudFormation, because an S3 bucket name is unique across every AWS account. Either way a stage without this file cannot synthesize at all.`,
    satisfiedLabel: "On disk",
    check: async (ctx) => {
      const loaded = readConfig(ctx.stage);
      const problems = configProblems(loaded);
      if (problems.length > 0) {
        return { satisfied: false, note: `${stageConfigPath} — ${problems[0]}` };
      }
      const identity = ctx.data.identity as { account?: string } | undefined;
      if (identity?.account && loaded?.account && identity.account !== loaded.account) {
        return {
          satisfied: false,
          note: `${stageConfigPath} names account ${loaded.account}, this profile is ${identity.account}`,
        };
      }
      if (ownsEverything(loaded)) {
        return {
          satisfied: true,
          note: `${stageConfigPath} — a new environment, creating its own tables, media and pool`,
        };
      }
      const tables = Object.keys(loaded?.existing?.tables ?? {}).length;
      return {
        satisfied: true,
        note: `${tables} tables imported · bucket ${loaded?.existing?.assetsBucket} · pool ${loaded?.existing?.userPoolId}`,
      };
    },
    apply: async (ctx) => {
      const identity = ctx.data.identity as { account?: string } | undefined;

      // A stage whose stacks are already there but whose file is not: the
      // resources exist, and inventing names for them would be a deploy that
      // creates a second set beside the real one.
      const deployed = await describeStack(`AcharDataStack-${ctx.stage}`, {
        profile: ctx.profile,
        region: ctx.region,
      });

      if (deployed) {
        ctx.progress("reading the deployed resources out of AWS");
        const result = await exec(
          ctx,
          "node",
          [
            "infra/scripts/import-state.mjs",
            `--stage=${ctx.stage}`,
            `--profile=${ctx.profile}`,
            `--region=${ctx.region}`,
          ],
          { cwd: ctx.root, timeoutMs: 5 * 60_000 },
        );
        assertOk(result, "import-state.mjs", 5 * 60_000);

        const loaded = readConfig(ctx.stage);
        const problems = configProblems(loaded);
        if (problems.length > 0) {
          throw new Error(
            `import-state wrote a file that is still incomplete: ${problems.join("; ")}`,
          );
        }
        return {
          note: `discovered from AcharDataStack-${ctx.stage} · ${Object.keys(loaded?.existing?.tables ?? {}).length} tables imported`,
        };
      }

      const seedStage = pickSeedStage(ctx.stage);
      const seed = seedStage ? readConfig(seedStage) : null;

      ctx.progress("writing a new environment");
      ctx.log(
        "note",
        `No stacks for '${ctx.stage}', so it is a **new environment**: it creates its own ten tables, assets bucket, CloudFront distribution, Cognito user pool and delivery queue — all named achar-${ctx.stage}-* and all empty.`,
      );
      ctx.log(
        "note",
        seedStage
          ? `It imports nothing, so it cannot read or write another environment's data. The product settings — mail, the Google client id and the callback URLs — are copied from achar-${seedStage}.json, because they are the same product in every environment.`
          : "It imports nothing, so it cannot read or write another environment's data. There was no other complete config to take the product settings from, so the Google client id and the callback URLs are empty: the Checklist tab is where they go, and a clear client id is a pool created without a provider.",
      );

      // One function writes a new environment's file, wherever it is written
      // from: here, or the Checklist tab, where a person has already supplied
      // the credentials and the seed is only standing in for the ones they did
      // not.
      const written = writeConfig(
        newStageConfig(ctx.stage, seed, {
          account: identity?.account ?? seed?.account ?? null,
          region: ctx.region ?? seed?.region ?? null,
        }),
      );

      return {
        note: `new environment written to ${path.relative(ctx.root, written)} · it creates its own tables, media and pool`,
      };
    },
  };

  const bootstrap: PlanStep = {
    id: "bootstrap",
    title: "CDK is bootstrapped in this account and region",
    detail:
      "`cdk deploy` uploads each function's bundle and each template to a bucket that the toolkit stack owns — `CDKToolkit`, one per account and region. It is a one-time install, and it is idempotent: bootstrapping again only updates it.",
    satisfiedLabel: "Bootstrapped",
    timeoutMs: 5 * 60_000,
    // One toolkit stack per account and region, however many environments there
    // are: two `cdk bootstrap` runs at once are two updates to one stack, and the
    // second is refused as already in progress.
    lock: "account",
    check: async (ctx) => {
      const toolkit = await describeStack("CDKToolkit", {
        profile: ctx.profile,
        region: ctx.region,
      });
      if (!toolkit) {
        return {
          satisfied: false,
          note: `no CDKToolkit stack in ${ctx.region} — run \`cdk bootstrap\` once for this account`,
        };
      }
      if (!toolkit.healthy) {
        return { satisfied: false, note: `CDKToolkit is ${stackLabel(toolkit.status)}` };
      }
      return {
        satisfied: true,
        note: `CDKToolkit is ${stackLabel(toolkit.status)} in ${ctx.region}`,
      };
    },
    apply: async (ctx) => {
      const identity = ctx.data.identity as { account?: string } | undefined;
      const account = identity?.account ?? readConfig(ctx.stage)?.account;
      if (!account) {
        throw new Error("The account could not be resolved, so bootstrap cannot target it.");
      }

      const result = await cdk(ctx, ["bootstrap", `aws://${account}/${ctx.region}`], {
        timeoutMs: 5 * 60_000,
      });
      assertOk(result, "cdk bootstrap", 5 * 60_000);
      return { note: `bootstrapped aws://${account}/${ctx.region}` };
    },
  };

  /**
   * Bundling, and why it is not a build step that can be skipped.
   *
   * `cdk synth` does not build anything: the stacks reference finished
   * directories under `infra/dist`, and a missing one is an ENOENT naming a path
   * under `dist/`. So a bundle that is stale is not a slow deploy — it is a
   * deploy of the last person's code.
   *
   * There is deliberately **no check**: the bundler keeps a fingerprint of every
   * handler's source and every shared package's, and rebuilds when it moved, so
   * asking it whether there is work costs the same as doing it. The step reads
   * what it said and marks itself satisfied when the answer was "Nothing to
   * rebuild".
   */
  const bundle: PlanStep = {
    id: "bundle",
    title: "The handlers are bundled",
    detail:
      "esbuild, once, into `infra/dist` — one directory per handler, rebuilt only when the fingerprint of the service's own source moved. Not `NodejsFunction`, which would run esbuild thirty-nine times at synth and put every handler's sourcemap in one zip.",
    satisfiedLabel: "Up to date",
    timeoutMs: 15 * 60_000,
    // `infra/dist` is one bundle for every stage, and esbuild writing it while a
    // second bundler is deciding what is stale is two answers to one question.
    lock: "checkout",
    apply: async (ctx) => {
      const result = await exec(ctx, "node", ["infra/scripts/bundle.mjs"], {
        timeoutMs: 15 * 60_000,
      });
      assertOk(result, "the bundler", 15 * 60_000);

      const current = /Nothing to rebuild: (\d+) handlers are current with (\d+) source files/.exec(
        result.stdout,
      );
      if (current) {
        return {
          note: `${current[1]} handlers already current with ${current[2]} source files`,
          status: "skipped",
        };
      }
      const bundled = /Bundled (\d+) handlers from (\d+) source files/.exec(result.stdout);
      if (bundled) {
        return { note: `${bundled[1]} handlers bundled from ${bundled[2]} source files` };
      }
      return { note: "the bundler finished; read the transcript for what it rebuilt" };
    },
  };

  /**
   * Synthesis, which is the only thing that validates the service as a whole.
   *
   * It is where the route table is resolved into API Gateway resources and where
   * CDK's own checks run — the resource count on the API stack, and any construct
   * that raises an annotation. A synth that succeeds is not a deploy that works,
   * but a synth that fails is a deploy that cannot.
   */
  const synth: PlanStep = {
    id: "synth",
    title: "The templates synthesize",
    detail:
      "`cdk synth` builds every stack locally, turns the route table into API Gateway resources, resolves every table's IAM, and reports what it found. A template that cannot be built is a deploy that would have failed eight minutes in.",
    timeoutMs: 15 * 60_000,
    apply: async (ctx) => {
      // No `--all`: `synth` is not one of the commands that takes it (it
      // synthesizes the whole app unless it is given stack names), and passing it
      // earns an "Unknown option(s)" complaint on every run that reads like a
      // problem and is not one.
      const result = await cdk(ctx, ["synth", "--quiet", "--context", `stage=${ctx.stage}`], {
        timeoutMs: 15 * 60_000,
      });
      assertOk(result, "cdk synth", 15 * 60_000);

      const notes = annotations(result.stderr);
      return {
        note: notes.length > 0 ? `synthesized · ${notes[0]}` : "synthesized with no annotations",
      };
    },
  };

  /**
   * The deploy itself.
   *
   * No check, on purpose: there is no cheap way to ask "would this change
   * anything" other than by running the diff, and the deploy already is one.
   * Running it again against an environment that is up is a no-op at
   * CloudFormation's level — which is the property that matters, and the note
   * says which of the two happened.
   *
   * ## Why this can be two deploys, and why that is not a retry
   *
   * An export that a stack still imports cannot be deleted, and `cdk deploy
   * --all` deploys the stack that *provides* an export before the stack that
   * reads it. So the one change that cannot land in a single pass is the change
   * that **removes a cross-stack reference**: the provider runs first, refuses to
   * drop the export, and the reader — whose new template no longer reads it —
   * never gets its turn. This app has three such references: the API stack reads
   * the assets bucket, the pool and its app client.
   *
   * Reported to a person, it is a sentence in a terminal about export names and
   * `--exclusively`. Here it is the deploy doing what that sentence asks —
   * `refusedExportName` finds the export, `exportReaders` finds who still imports
   * it, those stacks deploy on their own first, and then everything deploys. What
   * the person sees is a deploy that worked.
   */
  const deploy: PlanStep = {
    id: "deploy",
    title: "The five stacks deploy",
    detail:
      "Data, media, auth, webhooks and the API, and the nested stacks the routes are divided into. A stage that imports its tables, bucket and pool deploys them unmanaged — CloudFormation will not change or delete what it does not own.",
    timeoutMs: 60 * 60_000,
    apply: async (ctx) => {
      /** `<stack>: 'changed' | 'unchanged'`, as CDK reports each one. */
      const perStack = new Map<string, "changed" | "unchanged">();

      // The transcript and a parser both, which is why `exec` takes the line
      // handler rather than always writing to the transcript itself.
      const onLine = (stream: LogStream, text: string) => {
        ctx.log(stream, text);
        // ` ✅  AcharApiStack-dev (no changes)`. The variation selector is
        // optional in the pattern because whether an emoji carries U+FE0F
        // depends on how it was typed, and a regex that assumes one silently
        // stops matching when somebody's terminal or CDK version differs.
        const match = /^\s*(?:✅|❌|✨|✔|ℹ)\uFE0F?\s+(Achar\S+)\s*(\(no changes\))?/.exec(text);
        if (match) {
          perStack.set(match[1], match[2] ? "unchanged" : "changed");
          const changed = [...perStack.values()].filter((value) => value === "changed").length;
          const same = [...perStack.values()].filter((value) => value === "unchanged").length;
          ctx.progress(`${changed} changed · ${same} already in place`);
        }
      };

      const options = { timeoutMs: 60 * 60_000, onLine };
      const args = (...extra: string[]) => [
        "deploy",
        ...extra,
        "--require-approval",
        "never",
        "--progress",
        "events",
        "--context",
        `stage=${ctx.stage}`,
      ];

      let result = await cdk(ctx, args("--all"), options);

      // Bounded rather than `if`: a deploy can be removing more than one
      // cross-stack reference, and each one is found, unblocked and retried the
      // same way. An export is unblocked once: if the same one is refused again,
      // the readers' own deploy did not drop the import, and repeating it would
      // only spend another ten minutes arriving at the same sentence.
      const unblocked = new Set<string>();

      for (let recovered = 0; recovered < 3 && result.code !== 0 && !result.timedOut; recovered++) {
        const refused = refusedExportName(`${result.stdout}\n${result.stderr}`);
        if (!refused || unblocked.has(refused)) break;
        unblocked.add(refused);

        const readers = await exportReaders(refused, ctx);
        if (readers.length === 0) break;

        ctx.log(
          "out",
          `\nCloudFormation will not delete the export ${refused} while ${readers.join(", ")}\n` +
            `still import${readers.length === 1 ? "s" : ""} it, and CDK deploys the stack that provides an export\n` +
            "before the stacks that read it. Deploying the readers on their own first, so their\n" +
            "templates stop importing it, then deploying everything.\n\n",
        );

        // `--exclusively`, or CDK would drag the providing stack in ahead of
        // these and hit the same wall: `cdk deploy <stack>` deploys that stack's
        // dependencies with it unless it is told not to.
        const first = await cdk(ctx, args(...readers, "--exclusively"), options);
        assertOk(first, `cdk deploy ${readers.join(" ")}`, 60 * 60_000);

        result = await cdk(ctx, args("--all"), options);
      }

      assertOk(result, "cdk deploy", 60 * 60_000);

      const changed = [...perStack.entries()].filter(([, value]) => value === "changed");
      const unchanged = [...perStack.entries()].filter(([, value]) => value === "unchanged");

      ctx.data.deployedStacks = [...perStack.keys()];

      if (perStack.size === 0) {
        return { note: "the deploy finished; read the transcript for the per-stack result" };
      }
      if (changed.length === 0) {
        return {
          note: `nothing to change — all ${unchanged.length} stacks were already in place`,
          status: "skipped",
        };
      }
      return {
        note: `${changed.length} stack${changed.length === 1 ? "" : "s"} changed${
          unchanged.length ? `, ${unchanged.length} already in place` : ""
        }`,
      };
    },
  };

  /**
   * The post-condition, and the one place the run's result is read.
   *
   * `*_COMPLETE` is not enough on its own: `UPDATE_ROLLBACK_COMPLETE` also ends
   * in it, and it means the change was rolled back. `stackHealthy` is the set of
   * statuses that mean settled, and this step is where that distinction is
   * enforced rather than assumed.
   */
  const verify: PlanStep = {
    id: "verify",
    title: "Every stack is complete, with its outputs",
    detail:
      "The root stacks settle and carry the outputs an app needs — the API URL and its route count from the API stack, the pool, its client and its Hosted UI domain from the auth stack, the bucket and distribution from the media stack, the queue from the webhook stack, and a name for each table from the data stack. `UPDATE_ROLLBACK_COMPLETE` also ends in `_COMPLETE`; it means the opposite.",
    satisfiedLabel: "Verified",
    check: async (ctx) => {
      // Counted from `ROOT_STACKS` rather than written down here: a stack added
      // to the CDK app is a stack this step has to wait for, and a number in a
      // sentence is the one thing that cannot be kept in step with the app.
      const expected = rootStackNames(ctx.stage);
      const details = await describeStacks(expected, { profile: ctx.profile, region: ctx.region });
      if (details.length < expected.length) {
        return {
          satisfied: false,
          note: `${details.length} of ${expected.length} root stacks exist — the deploy has not completed`,
        };
      }
      const unhealthy = details.filter((detail) => !detail.healthy);
      if (unhealthy.length > 0) {
        return {
          satisfied: false,
          note: unhealthy.map((detail) => `${detail.name} is ${stackLabel(detail.status)}`).join("; "),
        };
      }
      const merged = details.reduce<Record<string, string>>(
        (acc, detail) => ({ ...acc, ...detail.outputs }),
        {},
      );
      const missing = [
        ["ApiUrl", merged.ApiUrl],
        ["UserPoolId", merged.UserPoolId],
        ["UserPoolClientId", merged.UserPoolClientId],
        ["AssetsBucketName", merged.AssetsBucketName],
      ].filter(([, value]) => !value);

      if (missing.length > 0) {
        return {
          satisfied: false,
          note: `the stacks are deployed but are missing ${missing.map(([key]) => key).join(", ")}`,
        };
      }

      ctx.data.stacks = details.map((detail) => ({
        name: detail.name,
        status: detail.status,
        healthy: detail.healthy,
        nested: false,
      }));
      ctx.data.outputs = await stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region });

      return {
        satisfied: true,
        note: `${details.length} root stacks complete · API ${merged.ApiUrl}`,
      };
    },
    apply: async (ctx) => {
      const details = await describeStacks(rootStackNames(ctx.stage), {
        profile: ctx.profile,
        region: ctx.region,
      });
      const unhealthy = details.filter((detail) => !detail.healthy);
      if (unhealthy.length > 0) {
        throw new Error(
          unhealthy.map((detail) => `${detail.name} is ${stackLabel(detail.status)}`).join("; "),
        );
      }
      ctx.data.stacks = details.map((detail) => ({
        name: detail.name,
        status: detail.status,
        healthy: detail.healthy,
        nested: false,
      }));
      return { note: `${details.length} root stacks complete` };
    },
  };

  /**
   * Pointing the apps at it.
   *
   * A deployment nobody's frontend points at is not a deployment anybody can
   * see, and this is the step that writes it down. **Only the five
   * `NEXT_PUBLIC_ACHAR_*` keys are replaced**: everything else in an app's
   * `.env.local` was put there by somebody else and cannot be derived here.
   *
   * A file names one environment, so a deploy here points the apps at *this*
   * stage and away from whichever stage they read before — and if two
   * environments are deployed at once, at whichever of them reached this step
   * last. That is the same answer two sequential deploys give, and it is the
   * reason this step and the bundler share a lock.
   */
  const point: PlanStep = {
    id: "point",
    title: "The four apps point at it",
    detail:
      "The API URL, the region, the pool, its app client and the Hosted UI domain are read out of this stage's stacks and written into each app's `.env.local` — and **only those five keys**: anything else in the file was put there by somebody else. A file names one environment, so a deploy here points the apps at *this* stage and away from whichever stage they read before.",
    satisfiedLabel: "Pointed at it",
    timeoutMs: 5 * 60_000,
    // One file per app, and it names one environment: two runs writing them at
    // once would interleave a key from each. Whoever runs last is what the apps
    // read afterwards, which is the same answer two sequential deploys give.
    lock: "checkout",
    check: async (ctx) => {
      const outputs = await stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region });
      if (!outputs.apiUrl) {
        return { satisfied: false, note: "the API stack has no ApiUrl output yet" };
      }
      ctx.data.outputs = outputs;

      const stale = APPS.filter(
        (app) => readFrontendEnv(app.key).NEXT_PUBLIC_ACHAR_API_URL !== outputs.apiUrl,
      );
      if (stale.length === 0) {
        return {
          satisfied: true,
          note: `${APPS.map((app) => app.key).join(", ")} all read ${outputs.apiUrl}`,
        };
      }
      return {
        satisfied: false,
        note: `${stale.map((app) => app.key).join(", ")} ${
          stale.length === 1 ? "is" : "are"
        } not pointed at ${outputs.apiUrl}`,
      };
    },
    apply: async (ctx) => {
      const outputs = await stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region });
      if (!outputs.apiUrl) {
        throw new Error("The API stack published no ApiUrl, so there is nothing to point at.");
      }

      for (const app of APPS) {
        const path = writeFrontendEnv(app.key, outputs.env);
        ctx.log("out", `${path.replace(`${ctx.root}/`, "")} — ${FRONTEND_ENV_KEYS.length} keys`);
      }

      ctx.data.outputs = outputs;
      return {
        note: `wrote .env.local for ${APPS.map((app) => app.key).join(", ")} · ${outputs.apiUrl}`,
      };
    },
  };

  /**
   * The probe.
   *
   * `GET /v1/info` is the one route with no authorizer, and it exists precisely
   * so a deployment can be asked whether it is up — `docs/architecture.md` says
   * so. A 200 is the shortest proof that the gateway, the missing authorizer and
   * at least one Lambda are wired to each other; a deployed API that answers 403
   * to everything looks identical from the stack's side.
   */
  const probe: PlanStep = {
    id: "probe",
    title: "The API answers",
    detail:
      "One call a stranger could make: `GET <ApiUrl>/v1/info`, the only route without an authorizer, which exists so a deployment can be asked whether it is up. A 200 on it proves the gateway, the authorizer's absence and at least one Lambda are wired to each other.",
    satisfiedLabel: "Answering",
    timeoutMs: 60_000,
    check: async (ctx) => {
      const outputs = await outputsFor(ctx);
      if (!outputs?.apiUrl) return { satisfied: false, note: "there is no API URL to call yet" };

      const health = await callApi(outputs.apiUrl);
      if (health.ok) {
        ctx.log("note", `GET ${outputs.apiUrl}/v1/info → ${health.status}`);
        return { satisfied: true, note: health.note };
      }
      return { satisfied: false, note: health.note };
    },
    apply: async (ctx) => {
      const outputs = await outputsFor(ctx);
      if (!outputs?.apiUrl) throw new Error("There is no API URL to call.");
      const health = await callApi(outputs.apiUrl);
      if (!health.ok) throw new Error(health.note);
      return { note: health.note };
    },
  };

  /**
   * The pool's app client, and the URLs it will accept.
   *
   * A sign-in ends at the app that began it, so Cognito has to have been told
   * where that is: `auth.callbackUrls` is the list it checks every redirect
   * against, and a missing origin fails as `redirect_uri_mismatch` — a
   * Google-branded error page that names nothing in this repository.
   *
   * Two things have to be true and the step checks both, because they are true in
   * different places. The **config file** is what a deploy reads, so the origins
   * have to be in it before the auth stack builds the client; the **live client**
   * is what Cognito actually checks, and a stage whose URL lists were saved after
   * its last deploy would otherwise have a file that says one thing and a pool
   * that does another. The write is the same one the Checklist's save makes.
   *
   * The three apps and not four: `apps/demo` is a third-party API client, so its
   * origin in this list would be a redirect Cognito accepts and no app asks for.
   */
  const callbackUrls: PlanStep = {
    id: "callback-urls",
    title: "The pool's app client accepts the app URLs",
    detail:
      "`auth.callbackUrls` in the environment's config is the list Cognito checks every sign-in redirect against — the web app, the studio and this console, each of which has to be there before a sign-in from it can complete. The origins are compared against the **running** app client as well as the file, because a deploy is not the only thing that decides them: a URL saved after the last deploy lives in the file and not yet in the pool.",
    satisfiedLabel: "Accepted",
    timeoutMs: 2 * 60_000,
    check: async (ctx) => {
      const loaded = readConfig(ctx.stage);
      const missing = missingOrigins(loaded);
      if (missing.length > 0) {
        return {
          satisfied: false,
          note: `${missing.map((entry) => entry.url).join(", ")} ${
            missing.length === 1 ? "is" : "are"
          } not in auth.callbackUrls`,
        };
      }

      const client = await liveClient(ctx);
      if (!client) {
        return {
          satisfied: true,
          note: `the file carries all ${SIGNING_IN_APPS.length} origins; the pool does not exist yet`,
        };
      }

      const absent = appOrigins(loaded).filter((origin) => !client.callbackUrls.includes(origin.url));
      if (absent.length === 0) {
        return {
          satisfied: true,
          note: `the app client accepts all ${SIGNING_IN_APPS.length} origins`,
        };
      }
      return {
        satisfied: false,
        note: `${absent.map((entry) => entry.url).join(", ")} not on the running app client`,
      };
    },
    apply: async (ctx) => {
      const loaded = readConfig(ctx.stage);
      const missing = missingOrigins(loaded);

      if (missing.length > 0) {
        if (!loaded) throw new Error(`There is no ${stageConfigPath} to write the origins into.`);
        const callbackUrls = [
          ...(loaded.auth?.callbackUrls ?? []),
          ...missing.map((entry) => entry.url),
        ];
        writeConfig({ ...loaded, auth: { ...loaded.auth, callbackUrls } });
        ctx.log("out", `added ${missing.map((entry) => entry.url).join(", ")} to auth.callbackUrls`);
      }

      const after = readConfig(ctx.stage);
      const client = await liveClient(ctx);
      if (!client) {
        return {
          note: `the file carries all ${SIGNING_IN_APPS.length} origins · the pool is built from it when the auth stack deploys`,
        };
      }

      const verdict = await applyAuthUrls(
        ctx.stage,
        {
          callbackUrls: after?.auth?.callbackUrls ?? [],
          logoutUrls: after?.auth?.logoutUrls ?? [],
        },
        { profile: ctx.profile, region: ctx.region },
      );
      return { note: verdict.note };
    },
  };

  return [
    toolchainStep(),
    credentialsStep(stage, "deploy"),
    config,
    bootstrap,
    bundle,
    synth,
    deploy,
    verify,
    point,
    probe,
    callbackUrls,
  ];
}

/* ------------------------------------------------------------------ *
 * What the deploy steps read
 * ------------------------------------------------------------------ */

/** The origins the config has to carry, and which of them it is missing. */
function missingOrigins(config: StageConfig | null): Array<{ app: AppDefinition; url: string }> {
  const listed = new Set((config?.auth?.callbackUrls ?? []).map((url) => url.replace(/\/$/, "")));
  return appOrigins(config).filter((entry) => !listed.has(entry.url.replace(/\/$/, "")));
}

/**
 * The app client that is running, with the URLs it accepts.
 *
 * Read by id, and the id is the config's or the deployed auth stack's output —
 * the same two sources `stageOutputs` already reads, so a stage whose file names
 * its pool and a stage that created one are both covered. Null means there is no
 * pool yet, which is a state rather than a failure: a new environment's client is
 * built by the auth stack on the deploy this step is part of.
 */
async function liveClient(ctx: StepContext): Promise<{ callbackUrls: string[] } | null> {
  const config = readConfig(ctx.stage);
  const outputs = await stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region }).catch(
    () => null,
  );
  const poolId = config?.existing?.userPoolId ?? outputs?.userPoolId ?? null;
  const clientId = config?.existing?.userPoolClientId ?? outputs?.userPoolClientId ?? null;
  if (!poolId || !clientId) return null;

  const answer = await awsJson<{ UserPoolClient?: { CallbackURLs?: string[] } }>(
    ["cognito-idp", "describe-user-pool-client", "--user-pool-id", poolId, "--client-id", clientId],
    { ...ctx, optional: true },
  ).catch(() => null);

  const callbacks = answer?.UserPoolClient?.CallbackURLs;
  return callbacks ? { callbackUrls: callbacks } : null;
}

/** The outputs, from this run's steps if they read them, or read now. */
async function outputsFor(ctx: StepContext): Promise<StageOutputs | null> {
  const cached = ctx.data.outputs as StageOutputs | undefined;
  if (cached?.apiUrl) return cached;
  return stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region });
}

interface Health {
  ok: boolean;
  status: string;
  note: string;
}

/**
 * What `<ApiUrl>/v1/info` says, as a sentence.
 *
 * `fetch` rather than `aws apigatewayv2` for the same reason a browser would: the
 * question is not what the API is configured to do but what it *answers*, and
 * only a request over the wire can tell the two apart. A non-200 is reported with
 * its status, because 403 and 500 mean different things here: the first is an
 * authorizer that was not supposed to be there, the second is a Lambda that is.
 */
async function callApi(apiUrl: string): Promise<Health> {
  const url = `${apiUrl.replace(/\/$/, "")}/v1/info`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        status: String(response.status),
        note: `${url} answered ${response.status} — a deployed API that refuses /v1/info is one whose authorizer is on the one route that must not have it`,
      };
    }

    const body = (await response.json().catch(() => null)) as
      | { service?: string; version?: string; stage?: string; region?: string }
      | null;

    const what = [body?.service, body?.version].filter(Boolean).join(" ");
    return {
      ok: true,
      status: String(response.status),
      note: body?.stage
        ? `${url} → 200 · ${what || "info"} · stage ${body.stage} in ${body.region ?? "?"}`
        : `${url} → 200`,
    };
  } catch (error) {
    return {
      ok: false,
      status: "no answer",
      note: `${url} could not be reached — ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

/* ------------------------------------------------------------------ *
 * The destroy plan
 * ------------------------------------------------------------------ */

/**
 * Deleting an environment: the stacks, and then — if it was asked for — the data.
 *
 * ## Why this is a plan rather than one `cdk destroy` behind a button
 *
 * `cdk destroy` is the middle of it, not the whole of it. An environment is five
 * stacks, a config file, and — behind one checkbox — ten tables, two buckets, a
 * distribution, a user pool, every log group and the credential the Checklist
 * wrote. Which of those go is the decision the person pressing the button is
 * making, and a run of steps is the only form in which that decision is legible
 * afterwards: the steps are in the transcript, so the page reads what actually
 * happened rather than remembering what was ticked.
 *
 * ## Why it refuses first
 *
 * A resource can belong to more than one stage, and only in one way: a stage whose
 * config names another's tables, bucket, distribution or pool, because it
 * **imports** them. Deleting that resource is not deleting this environment — it
 * is another environment's data, or another environment's accounts, disappearing
 * because somebody pressed a button labelled with a name that was not theirs. So
 * the second step reads every other stage's config and stops the run before
 * anything has been destroyed.
 *
 * ## Why the last step reports
 *
 * The point of the data tick is that the leftovers *are* the problem: every
 * stateful resource here is `RemovalPolicy.RETAIN`, so `cdk destroy` on its own
 * stops at the stacks and leaves everything else in AWS with nobody managing it.
 * Those orphans are what stop a redeploy of the same name at early validation,
 * and they are what an environment nobody can deploy to is still paying for. What
 * the run could not take with it is therefore the *answer* to this run rather than
 * an afterthought, which is why `RunView.report` exists.
 */
export interface DestroyOptions {
  /**
   * Whether the data goes with the stacks.
   *
   * Read once, before the run exists, because it decides which steps the plan
   * *has*: a run that was not asked to delete the data has no step that could,
   * rather than a step that checks a flag.
   */
  deleteData?: boolean;
}

export function buildDestroyPlan(stage: string, options: DestroyOptions = {}): PlanStep[] {
  const deleteData = options.deleteData === true;
  const stageConfigPath = path.relative(repoPath(), configFile(stage));

  const credentials = credentialsStep(stage, "destroy");

  /**
   * The refusal, and the only step here that is about somebody else.
   *
   * Two ways one resource ends up shared, and they look different and are not:
   *
   * - **A stage that imports.** Its config names this stage's table, bucket,
   *   distribution or pool in `existing`, and an imported resource is unmanaged —
   *   so this run's `cdk destroy` would not delete it, but the data tick would,
   *   and the redeploy that followed would leave that stage pointed at a name
   *   nothing answers to.
   * - **A stage that owns.** Nothing names it, and it cannot collide: an owning
   *   stage's resources are named `achar-<stage>-*`, and the stage name is unique
   *   in the config directory, because the directory is keyed by it.
   *
   * The comparison is by name, both exact and by prefix, because the two sides
   * know different things: a config that imports names a physical table, and a
   * config that owns names nothing at all — its tables are `achar-<stage>-*` and
   * only the naming rule knows them.
   */
  const sharedGuard: PlanStep = {
    id: "shared",
    title: "Nothing else stands on what this environment stands on",
    detail:
      "Every other stage's config is read, and the run **refuses** if one of them names a table, bucket, distribution or user pool this environment is about to delete. That resource is not this environment's to take: it is another stage's data, or another stage's accounts, and deleting it would break an environment nobody asked about.",
    satisfiedLabel: "Nothing shares it",
    check: async (ctx) => {
      const conflicts = sharingConflicts(ctx.stage);
      if (conflicts.length === 0) {
        return {
          satisfied: true,
          note: `no other stage's config names a resource of '${ctx.stage}'`,
        };
      }
      return { satisfied: false, note: describeConflicts(conflicts) };
    },
    apply: async (ctx) => {
      const conflicts = sharingConflicts(ctx.stage);
      if (conflicts.length > 0) {
        throw new Error(
          `${describeConflicts(conflicts)}\n\nRefusing to delete '${ctx.stage}': those resources are ` +
            "named by another environment's config, which means that environment reads them. " +
            "Delete the stage that owns them last, or take the names out of the other configs first.",
        );
      }
      return { note: "nothing else in this repository names these resources" };
    },
  };

  const destroy: PlanStep = {
    id: "destroy",
    title: "The five stacks are destroyed",
    detail:
      "`cdk destroy --all --force` — `--force` because every process this console starts has stdin on `ignore`, so CDK's confirmation would read an end-of-file. The names only a stack knows are read out of the outputs **before** it goes: which bucket the assets live in, and which distribution serves them.",
    timeoutMs: 60 * 60_000,
    apply: async (ctx) => {
      const deployed = await describeStacks(rootStackNames(ctx.stage), {
        profile: ctx.profile,
        region: ctx.region,
      });
      if (deployed.length === 0) {
        return {
          note: `no stack of '${ctx.stage}' is deployed, so there is nothing to destroy`,
          status: "skipped",
        };
      }

      // Read now, because the stacks that publish them are about to stop
      // existing — and a bucket whose name is gone is a bucket nobody can find
      // again. A generated name is written down nowhere else.
      ctx.data.outputs = await stageOutputs(ctx.stage, {
        profile: ctx.profile,
        region: ctx.region,
      }).catch(() => null);
      ctx.data.destroyed = deployed.map((detail) => detail.name);

      const result = await cdk(
        ctx,
        ["destroy", "--all", "--force", "--context", `stage=${ctx.stage}`],
        { timeoutMs: 60 * 60_000 },
      );
      assertOk(result, "cdk destroy", 60 * 60_000);

      return {
        note: `${deployed.length} stacks destroyed · the data they stood on is ${
          deleteData ? "being deleted next" : "retained"
        }`,
      };
    },
  };

  /**
   * The post-condition, and the one that decides whether the config file goes.
   *
   * A stack in `DELETE_FAILED` is a stack that still exists, and the config file
   * is the only thing that names it. So the run stops here rather than tidying up
   * after itself: what is left is worth having a file about.
   */
  const noStack: PlanStep = {
    id: "no-stack",
    title: "No stack of this environment is left",
    detail:
      "The post-condition. A stack in `DELETE_FAILED` — or one CloudFormation is still working on — stops the run **before** the config file goes, because that is the case where the file is still worth having.",
    satisfiedLabel: "Gone",
    check: async (ctx) => {
      const left = await describeStacks(rootStackNames(ctx.stage), {
        profile: ctx.profile,
        region: ctx.region,
      });
      if (left.length === 0) return { satisfied: true, note: "no stack of this stage remains" };
      return {
        satisfied: false,
        note: left.map((detail) => `${detail.name} is ${stackLabel(detail.status)}`).join("; "),
      };
    },
    apply: async (ctx) => {
      const left = await describeStacks(rootStackNames(ctx.stage), {
        profile: ctx.profile,
        region: ctx.region,
      });
      if (left.length > 0) {
        throw new Error(
          left.map((detail) => `${detail.name} is ${stackLabel(detail.status)}`).join("; "),
        );
      }
      return { note: "no stack of this stage remains" };
    },
  };

  const plan: PlanStep[] = [credentials, sharedGuard, destroy, noStack];

  if (deleteData) {
    plan.push(tablesStep(), mediaStep(), poolStep(), logGroupsStep(), credentialsDataStep());
  }

  // One reporting step or the other, and the difference is the direction of the
  // question: with the data gone there is nothing left to enumerate, so what is
  // worth saying is what could *not* be taken; without it, the leftovers are the
  // whole answer.
  plan.push(deleteData ? stillPointingStep(stage) : remainingStep(stage));

  plan.push({
    id: "config",
    title: "The environment's config file is removed",
    detail: `\`${stageConfigPath}\` is what makes this stage an environment in this console at all — a row in the list, a stack-name suffix, a table's name prefix. It goes last, and only once the stacks are gone, because a config file with no stacks is a stage somebody can start over from and no stacks with a config file is a stage that looks deployed and is not.`,
    satisfiedLabel: "Removed",
    apply: async (ctx) => {
      const file = configFile(ctx.stage);
      if (!fs.existsSync(file)) return { note: `${stageConfigPath} was already gone` };
      fs.rmSync(file);
      return { note: `${stageConfigPath} removed — it is a tracked file, so the deletion is yours to commit` };
    },
  });

  return plan;
}

/* ------------------------------------------------------------------ *
 * What the destroy plan reads
 * ------------------------------------------------------------------ */

/** One resource of one environment, and the name it answers to. */
interface SharedUse {
  stage: string;
  what: string;
  name: string;
}

/**
 * The resources this stage's config names, or that its naming rule produces.
 *
 * `existing` is the config half, and the prefix is the other one: a stage that
 * owns its tables names them nowhere, so the only way to know that
 * `achar-dev-documents-table` is dev's is to know how the stage names things —
 * `infra/src/naming.ts`'s `tableName`. Both are returned, and the caller
 * compares them the same way.
 */
function resourceNamesOf(stage: string, config: StageConfig | null): Map<string, string> {
  const names = new Map<string, string>();

  const existing = config?.existing;
  for (const [logical, physical] of Object.entries(existing?.tables ?? {})) {
    names.set(physical, `${logical} (imported)`);
  }
  if (existing?.assetsBucket) names.set(existing.assetsBucket, "the assets bucket (imported)");
  if (existing?.cloudFrontDistributionId) {
    names.set(existing.cloudFrontDistributionId, "the CloudFront distribution (imported)");
  }
  if (existing?.userPoolId) names.set(existing.userPoolId, "the Cognito user pool (imported)");

  return names;
}

/**
 * What another stage is standing on, and whether it is a prefix of ours.
 *
 * The prefix comparison is the half that catches an *owning* stage: dev's config
 * names none of its own resources, but everything it has begins `achar-dev-`, and
 * a resource beginning `achar-dev-` is dev's whatever else is true about it. It is
 * deliberately not a substring test in the other direction — a stage is free to
 * have a name that contains another's.
 */
function sharingConflicts(stage: string): SharedUse[] {
  const conflicts: SharedUse[] = [];
  const prefix = `achar-${stage}-`;

  for (const other of listStages()) {
    if (other === stage) continue;
    const config = readConfig(other);

    for (const [name, what] of resourceNamesOf(other, config)) {
      if (name === stage || name.startsWith(prefix)) {
        conflicts.push({ stage: other, what, name });
      }
    }
  }

  return conflicts;
}

function describeConflicts(conflicts: SharedUse[]): string {
  return conflicts
    .map((conflict) => `'${conflict.stage}' imports this environment's ${conflict.what}: ${conflict.name}`)
    .join("; ");
}

/**
 * The tables this stage created, deleted and waited for.
 *
 * The names come from `tablesOf`, which asks the account by name prefix rather
 * than reading the Data stack — the stack is gone by the time this runs, and a
 * table whose name is guessed is a table that is not deleted. The CLI's own
 * waiter is what makes this step end when the table is gone rather than when the
 * request was accepted.
 */
function tablesStep(): PlanStep {
  return {
    id: "tables",
    title: "The tables are gone",
    detail:
      "Every table this environment created, deleted and waited for. A table is `RemovalPolicy.RETAIN`, so `cdk destroy` leaves it behind on purpose — and a table left behind is what stops a redeploy of the same name at early validation, holding a name the new stack wants.",
    timeoutMs: 30 * 60_000,
    apply: async (ctx) => {
      // The account, not the stack: the Data stack that published these names
      // went in step three, and a table that outlived it is precisely what this
      // step is for. The captured outputs are added because they are the only
      // place a name exists at all if the table has since been removed by hand.
      const names = await tablesOf(ctx);
      if (names.length === 0) {
        return { note: "there are no tables named for this stage", status: "skipped" };
      }

      for (const name of names) {
        ctx.progress(`${names.indexOf(name) + 1} of ${names.length} — ${name}`);
        const result = await exec(
          ctx,
          "aws",
          [
            "dynamodb",
            "delete-table",
            "--table-name",
            name,
            "--profile",
            ctx.profile,
            "--region",
            ctx.region,
          ],
          { timeoutMs: 2 * 60_000 },
        );
        if (result.code !== 0 && !/ResourceNotFoundException/.test(result.stderr)) {
          noteLeft(ctx, `${name} could not be deleted — ${failureNote(result)}`);
          continue;
        }

        const waited = await exec(
          ctx,
          "aws",
          [
            "dynamodb",
            "wait",
            "table-not-exists",
            "--table-name",
            name,
            "--profile",
            ctx.profile,
            "--region",
            ctx.region,
          ],
          { timeoutMs: 10 * 60_000 },
        );
        if (waited.code !== 0) {
          noteLeft(ctx, `${name} was deleted but has not gone away yet`);
        }
      }

      return { note: `${names.length} tables deleted` };
    },
  };
}

/**
 * The distribution and the two buckets.
 *
 * The order is forced three times over, and none of it is a preference:
 * CloudFront will not delete an enabled distribution, a bucket has to be empty
 * before it can be deleted, and the distribution's own log bucket is not named by
 * anything this run can read — it is a CloudFormation-generated name, so it is
 * found by `<stack>-` prefix and reported if that finds nothing.
 */
function mediaStep(): PlanStep {
  return {
    id: "media",
    title: "The media is gone",
    detail:
      "The distribution, then the two buckets. CloudFront will not delete an enabled distribution, so it is disabled, waited for, and then deleted — and a bucket has to be emptied before it can be deleted, which is what makes this the slowest step of the run.",
    timeoutMs: 45 * 60_000,
    apply: async (ctx) => {
      const outputs = ctx.data.outputs as StageOutputs | null;
      const config = readConfig(ctx.stage);
      // Both sources are read *before* the stacks went: the config for a stage
      // that imports its distribution, and the media stack's own output for a
      // stage that created one, because CloudFront assigns the id and nothing
      // else writes it down.
      const distributionId =
        config?.existing?.cloudFrontDistributionId ??
        outputs?.cloudFrontDistributionId ??
        null;

      if (distributionId) {
        await deleteDistribution(ctx, distributionId);
      }

      const buckets = new Set<string>();
      if (outputs?.assetsBucketName) buckets.add(outputs.assetsBucketName);
      if (config?.existing?.assetsBucket) buckets.add(config.existing.assetsBucket);

      // The log bucket's name is CloudFormation's, and the media stack is named
      // predictably, so its generated resources share a prefix with it.
      const generated = await listBuckets(`acharmediastack-${ctx.stage}-`, {
        profile: ctx.profile,
        region: ctx.region,
      }).catch(() => []);
      for (const name of generated) buckets.add(name);

      for (const bucket of buckets) {
        await emptyAndDeleteBucket(ctx, bucket);
      }

      if (buckets.size === 0) {
        return { note: "no bucket of this stage was found to delete", status: "skipped" };
      }
      return {
        note: `${buckets.size} bucket${buckets.size === 1 ? "" : "s"} emptied and deleted${
          distributionId ? `, distribution ${distributionId} disabled and deleted` : ""
        }`,
      };
    },
  };
}

/**
 * Empty, then delete — and the CLI does both in one call.
 *
 * `s3 rb --force` deletes every object *and every version*, which is the part
 * that is easy to get wrong by hand: an unversioned `delete-objects` leaves the
 * versions behind, CloudFront's log bucket turns versioning on, and the bucket
 * then refuses to be deleted with "BucketNotEmpty" over a bucket that looks
 * empty. One call that is right beats three that nearly are.
 */
async function emptyAndDeleteBucket(ctx: StepContext, bucket: string): Promise<void> {
  ctx.progress(`emptying ${bucket}`);

  const removed = await exec(
    ctx,
    "aws",
    ["s3", "rb", `s3://${bucket}`, "--force", "--profile", ctx.profile, "--region", ctx.region],
    { timeoutMs: 20 * 60_000 },
  );
  if (removed.code !== 0) {
    noteLeft(ctx, `${bucket} could not be deleted — ${failureNote(removed)}`);
  }
}

/**
 * The distribution, disabled and waited for before it is deleted.
 *
 * The wait is the point rather than a formality: CloudFront's disable is
 * asynchronous, and a delete issued against an enabled distribution fails with
 * `DistributionNotDisabled` — a sentence that reads like a permissions problem
 * and is not one.
 */
async function deleteDistribution(ctx: StepContext, id: string): Promise<void> {
  const current = await awsJson<{
    Distribution?: { Id: string; ETag: string; DistributionConfig: Record<string, unknown> };
  }>(["cloudfront", "get-distribution-config", "--id", id], {
    ...ctx,
    optional: true,
  }).catch(() => null);

  const distribution = current?.Distribution;
  if (!distribution?.ETag || !distribution.DistributionConfig) {
    noteLeft(ctx, `distribution ${id} could not be read, so it was not deleted`);
    return;
  }

  const config = { ...distribution.DistributionConfig, Enabled: false };
  const disabled = await awsJson(
    [
      "cloudfront",
      "update-distribution",
      "--id",
      id,
      "--if-match",
      distribution.ETag,
      "--distribution-config",
      JSON.stringify(config),
    ],
    { ...ctx, optional: true },
  ).catch(() => null);

  if (!disabled) {
    noteLeft(
      ctx,
      `distribution ${id} could not be disabled — every asset URL on it keeps working until it is`,
    );
    return;
  }

  ctx.progress(`waiting for distribution ${id} to be deployed as disabled`);

  // Polled rather than `wait distribution-deployed`: the CLI's waiter takes
  // minutes per poll and has no way to notice Stop, and this run's Stop has to
  // work on the step that takes longest.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (ctx.stopped()) return;
    await sleep(15_000);
    const again = await awsJson<{ Distribution?: { DistributionConfig?: { Enabled?: boolean } } }>(
      ["cloudfront", "get-distribution", "--id", id],
      { ...ctx, optional: true },
    ).catch(() => null);
    const enabled = again?.Distribution?.DistributionConfig?.Enabled;
    if (enabled === false) break;
  }

  const etagNow = await awsJson<{ ETag?: string }>(
    ["cloudfront", "get-distribution", "--id", id],
    { ...ctx, optional: true },
  ).catch(() => null);

  const deleted = await exec(
    ctx,
    "aws",
    [
      "cloudfront",
      "delete-distribution",
      "--id",
      id,
      ...(etagNow?.ETag ? ["--if-match", etagNow.ETag] : []),
      "--profile",
      ctx.profile,
      "--region",
      ctx.region,
    ],
    { timeoutMs: 5 * 60_000 },
  );
  if (deleted.code !== 0) {
    noteLeft(ctx, `distribution ${id} could not be deleted — ${failureNote(deleted)}`);
  }
}

/**
 * The user pool, and its own step because of what it holds.
 *
 * This is the one deletion that is about people: a redeploy of the same name
 * makes a **new**, empty pool, and everybody signs up again. It is last of the
 * resource steps for that reason — if anything above it failed, the run has
 * already stopped and nobody has lost an account.
 */
function poolStep(): PlanStep {
  return {
    id: "pool",
    title: "The user pool is gone, with every account in it",
    detail:
      "The pool, its app client and its Hosted UI domain. Its own step because it is the one deletion that is about people: a redeploy of the same name creates a **new**, empty pool and everybody signs up again. Reported is how many accounts went with it, because a number is the only honest thing to say about a deletion nobody can undo.",
    timeoutMs: 10 * 60_000,
    apply: async (ctx) => {
      const config = readConfig(ctx.stage);
      const outputs = ctx.data.outputs as StageOutputs | null;
      const poolId = config?.existing?.userPoolId ?? outputs?.userPoolId ?? null;

      if (!poolId) return { note: "this stage named no user pool", status: "skipped" };

      const described = await awsJson<{
        UserPool?: { EstimatedNumberOfUsers?: number };
      }>(["cognito-idp", "describe-user-pool", "--user-pool-id", poolId], {
        ...ctx,
        optional: true,
      }).catch(() => null);

      const users = described?.UserPool?.EstimatedNumberOfUsers ?? 0;

      const deleted = await exec(
        ctx,
        "aws",
        [
          "cognito-idp",
          "delete-user-pool",
          "--user-pool-id",
          poolId,
          "--profile",
          ctx.profile,
          "--region",
          ctx.region,
        ],
        { timeoutMs: 5 * 60_000 },
      );
      if (deleted.code !== 0) {
        noteLeft(ctx, `pool ${poolId} could not be deleted — ${failureNote(deleted)}`);
        return { note: `the pool was not deleted — ${users} accounts are still in it` };
      }

      return { note: `${poolId} deleted, with ${users} account${users === 1 ? "" : "s"}` };
    },
  };
}

/**
 * Every log group this stage owns.
 *
 * Found by prefix rather than by reading the deployed functions, and it has to be:
 * the functions are gone by now — the stacks that created them went in step three
 * — and a log group outlives the function that wrote to it. It is also the first
 * thing that stops a redeploy of the same name: CloudFormation refuses to create
 * a log group that already exists.
 */
function logGroupsStep(): PlanStep {
  return {
    id: "log-groups",
    title: "The log groups are gone",
    detail:
      "One per function — thirty-nine of them, plus the webhook's — found by the prefix `/aws/lambda/achar-<stage>-`, because a log group outlives the function that wrote to it and the deployed set is not readable any more by this point. A log group left behind is the first thing that stops a redeploy of the same name.",
    timeoutMs: 15 * 60_000,
    apply: async (ctx) => {
      const names = await logGroupsOf(ctx);
      if (names.length === 0) {
        return { note: "no log group of this stage remains", status: "skipped" };
      }

      let deleted = 0;
      for (const name of names) {
        ctx.progress(`${deleted + 1} of ${names.length} — ${name}`);
        const result = await exec(
          ctx,
          "aws",
          [
            "logs",
            "delete-log-group",
            "--log-group-name",
            name,
            "--profile",
            ctx.profile,
            "--region",
            ctx.region,
          ],
          { timeoutMs: 60_000 },
        );
        if (result.code === 0) deleted += 1;
        else noteLeft(ctx, `${name} could not be deleted`);
      }

      return { note: `${deleted} of ${names.length} log groups deleted` };
    },
  };
}

/**
 * Every table of this stage that is in the account right now.
 *
 * Two sources, because they can disagree and both are true. The **account** is
 * asked by name prefix — `achar-<stage>-<kebab-of-id>`, which is the rule
 * `infra/src/naming.ts` names every table by — and that is what finds a table
 * whose stack has gone. The run's **captured outputs** are added because they are
 * the physical names a Data stack published, which is the only place a name is
 * written down at all if the table has since been deleted by hand.
 *
 * Deliberately not `stageTableNames`, which is the tables tab's source: that
 * reads the Data stack, and by the time a delete asks this question the stack it
 * would read has already been destroyed. That is not a detail — it is the
 * difference between a delete that removes ten tables and one that reports there
 * were none.
 */
async function tablesOf(ctx: StepContext): Promise<string[]> {
  const names = new Set(
    await listTables(`achar-${ctx.stage}-`, { profile: ctx.profile, region: ctx.region }).catch(
      () => [],
    ),
  );

  const outputs = ctx.data.outputs as StageOutputs | null;
  for (const name of Object.values(outputs?.tables ?? {})) names.add(name);

  return [...names].sort();
}

async function logGroupsOf(ctx: StepContext): Promise<string[]> {
  const names: string[] = [];
  let next: string | undefined;

  do {
    const page = await awsJson<{ logGroups?: Array<{ logGroupName?: string }>; nextToken?: string }>(
      [
        "logs",
        "describe-log-groups",
        "--log-group-name-prefix",
        `/aws/lambda/achar-${ctx.stage}-`,
        ...(next ? ["--next-token", next] : []),
      ],
      { profile: ctx.profile, region: ctx.region, optional: true },
    );
    for (const group of page?.logGroups ?? []) {
      if (group.logGroupName) names.push(group.logGroupName);
    }
    next = page?.nextToken;
  } while (next);

  return names.sort();
}

/**
 * The credential the Checklist wrote.
 *
 * Per stage and named after it, so this is the one secret the console knows it
 * owns: `achar/<stage>/google-client-secret`. Removed because it is the thing
 * that would otherwise be left pointing at a Google project that no longer has a
 * client — a stage that comes back comes back from the Checklist, not from what
 * the last one left behind.
 */
function credentialsDataStep(): PlanStep {
  return {
    // `secrets`, not `credentials`: the step above with that id is the identity
    // check, and two steps sharing an id is two rows the page cannot tell apart —
    // it keys them by id, so opening one would open both.
    id: "secrets",
    title: "This environment's credentials are gone",
    detail:
      "The Google client secret in Secrets Manager, at `achar/<stage>/google-client-secret`. It is per stage and named after it, which is what makes it safe to delete: no other environment reads it. What is deliberately *not* touched is a Google OAuth client in the Cloud console — nothing here can enumerate what else uses it.",
    timeoutMs: 2 * 60_000,
    apply: async (ctx) => {
      const name = googleClientSecretName(ctx.stage);
      const exists = await googleSecretStatus(ctx.stage, {
        profile: ctx.profile,
        region: ctx.region,
      });
      if (!exists) return { note: `no secret at ${name}`, status: "skipped" };

      const result = await exec(
        ctx,
        "aws",
        [
          "secretsmanager",
          "delete-secret",
          "--secret-id",
          name,
          // Without this the deletion is reversible for thirty days, which
          // sounds kinder and is not: the secret keeps its name, and a redeploy
          // that creates one finds a name already taken.
          "--force-delete-without-recovery",
          "--profile",
          ctx.profile,
          "--region",
          ctx.region,
        ],
        { timeoutMs: 60_000 },
      );
      if (result.code !== 0) {
        noteLeft(ctx, `${name} could not be deleted — ${failureNote(result)}`);
        return { note: `${name} is still there` };
      }
      return { note: `${name} deleted` };
    },
  };
}

/**
 * What is still pointed here, after the data has gone.
 *
 * A reporting step in both plans, and it applies nothing: pointing the apps
 * somewhere else is a decision about this product rather than a step toward
 * deleting this environment. What it adds is the one thing a deletion cannot do
 * for itself — four `.env.local` files that name an API URL which no longer
 * answers, and which a person will otherwise find by running an app.
 */
function stillPointingStep(stage: string): PlanStep {
  return {
    id: "left",
    title: "What is still pointed here",
    detail:
      "**Reports instead of applying.** The four apps' `.env.local` files are compared against the API URL captured before the stack that published it went away, and anything the run could not delete is listed with the reason. Pointing the apps somewhere else is a decision about this product, not a step toward deleting this environment — so the console says what it found and leaves it.",
    satisfiedLabel: "Reported",
    apply: async (ctx) => {
      const outputs = ctx.data.outputs as StageOutputs | null;
      const lines: string[] = [];

      if (outputs?.apiUrl) {
        const pointing = APPS.filter(
          (app) => readFrontendEnv(app.key).NEXT_PUBLIC_ACHAR_API_URL === outputs.apiUrl,
        );
        if (pointing.length > 0) {
          lines.push(
            `${pointing.map((app) => `apps/${app.key}/.env.local`).join(", ")} still ${pointing.length === 1 ? "reads" : "read"} ${outputs.apiUrl}`,
          );
        } else {
          lines.push(`no app's .env.local read ${outputs.apiUrl} at the end of the run`);
        }
      } else {
        lines.push(
          "the API URL could not be captured before the stack went, so the apps could not be compared against it",
        );
      }

      lines.push(...readLeft(ctx));
      ctx.data.left = lines;
      return { note: `${lines.length} thing${lines.length === 1 ? "" : "s"} to report` };
    },
  };
}

/**
 * What a redeploy of this name will hit.
 *
 * The other reporting step, for the plan that keeps the data. It reads the
 * account rather than predicting it: how many tables are still named for this
 * stage, which buckets are left, how many log groups, and — the one worth the
 * read — the pool and how many accounts are still in it. Every line is something
 * a redeploy of the same name has to get past, which is exactly what somebody
 * deciding whether to press Deploy again needs to know.
 */
function remainingStep(stage: string): PlanStep {
  return {
    id: "remaining",
    title: "What is left behind, and what a redeploy of this name will hit",
    detail:
      "**Reports instead of applying.** Every stateful resource here is `RemovalPolicy.RETAIN`, so destroying the stacks leaves the ten tables, the buckets, the distribution, the pool and every log group in AWS with nobody managing them. This step reads the account and says what is still there — and what each of them does to a redeploy of the same name, which is where a leftover stops being inert.",
    satisfiedLabel: "Reported",
    timeoutMs: 5 * 60_000,
    apply: async (ctx) => {
      // What the earlier steps could not do comes first: a leftover that stopped
      // a deletion is the most useful line in this report, and it is written by
      // the step that hit it rather than reconstructed here.
      const lines: string[] = readLeft(ctx);

      const tables = await tablesOf(ctx).catch(() => []);
      if (tables.length > 0) {
        lines.push(
          `${tables.length} tables are still there (${listNames(tables)}) — a redeploy creates the same names, and CloudFormation refuses a table that already exists`,
        );
      }

      const buckets = await listBuckets(`acharmediastack-${stage}-`, {
        profile: ctx.profile,
        region: ctx.region,
      }).catch(() => []);
      const outputs = ctx.data.outputs as StageOutputs | null;
      const allBuckets = new Set([...buckets, ...(outputs?.assetsBucketName ? [outputs.assetsBucketName] : [])]);
      if (allBuckets.size > 0) {
        lines.push(
          `${allBuckets.size} buckets are still there (${listNames([...allBuckets])}) — an S3 name is global, so a redeploy either adopts the name from the config or CloudFormation fails early validation`,
        );
      }

      const groups = await logGroupsOf(ctx).catch(() => []);
      if (groups.length > 0) {
        lines.push(
          `${groups.length} log groups are still there — CloudFormation refuses to create a log group that already exists, so these stop a redeploy before anything else does`,
        );
      }

      const config = readConfig(stage);
      const outputsAfter = ctx.data.outputs as StageOutputs | null;
      const poolId = config?.existing?.userPoolId ?? outputsAfter?.userPoolId ?? null;
      if (poolId) {
        const described = await awsJson<{ UserPool?: { EstimatedNumberOfUsers?: number } }>(
          ["cognito-idp", "describe-user-pool", "--user-pool-id", poolId],
          { ...ctx, optional: true },
        ).catch(() => null);
        const users = described?.UserPool?.EstimatedNumberOfUsers;
        lines.push(
          users === undefined
            ? `the user pool ${poolId} is still there`
            : `the user pool ${poolId} is still there, with ${users} account${users === 1 ? "" : "s"} in it — a redeploy of this name makes a new, empty pool and everybody signs up again`,
        );
      }

      const distribution =
        config?.existing?.cloudFrontDistributionId ??
        outputsAfter?.cloudFrontDistributionId ??
        null;
      if (distribution) {
        lines.push(`the CloudFront distribution ${distribution} still exists — remove it by hand`);
      }

      if (lines.length === 0) {
        lines.push(
          "nothing of this environment is left in the account — a redeploy of the same name starts from nothing",
        );
      }

      ctx.data.left = lines;
      return { note: `${lines.length} thing${lines.length === 1 ? "" : "s"} to report` };
    },
  };
}

/** `a, b and 2 more` — a list somebody reads, not one they count. */
function listNames(names: string[], limit = 3): string {
  if (names.length <= limit) return names.join(", ");
  return `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
}

/** What a step could not do, for the last step to report. */
function noteLeft(ctx: StepContext, line: string): void {
  const left = (ctx.data.left as string[] | undefined) ?? [];
  left.push(line);
  ctx.data.left = left;
  ctx.log("err", line);
}

/**
 * The same list, read back.
 *
 * The destroy plan's reporting steps are where `ctx.data.left` becomes the run's
 * answer: a step that cannot delete something records it rather than failing, and
 * the *last* step is what turns those records into the list `RunView.report`
 * carries. Reading it here and clearing it means a run cannot carry the same line
 * twice if a plan ever grows a second reporting step.
 */
function readLeft(ctx: StepContext): string[] {
  const left = (ctx.data.left as string[] | undefined) ?? [];
  ctx.data.left = [];
  return left;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
