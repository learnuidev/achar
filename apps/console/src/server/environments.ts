import fs from "node:fs";
import path from "node:path";

import type { AppKey, EnvironmentView, ProfileSource } from "@/lib/types";
import { describeStack, describeStacks, summariseStacks, type CloudStack } from "./aws";
import { defaultRegion, profileSetting, repoPath } from "./repo";

/**
 * An environment, as the console understands one.
 *
 * The unit is a **stage**, which is what the CDK app calls it: `cdk deploy
 * --context stage=dev` deploys `AcharApiStack-dev` and its four siblings, and the
 * stage name is in every Lambda's name, every stack's name, every table's name
 * and every log group's path.
 *
 * ## What that name is written into
 *
 * One string decides all of it, which is why the name is a validated value rather
 * than free text anywhere it is typed: it becomes a stack-name suffix, a
 * CloudFormation stack's name, the physical name of ten DynamoDB tables, a
 * `--context` value, and a filename under `infra/config/`.
 *
 * ## Two kinds of environment, and the difference is one switch
 *
 * `ownership` in `infra/config/achar-<stage>.json` decides what a stage does with
 * the three stateful groups — the tables, the media (bucket and distribution) and
 * the auth (user pool):
 *
 * | | `tables`/`media`/`auth` | The stage | Its data |
 * | --- | --- | --- | --- |
 * | **New** | `true` | Creates them, named after the stage or by CloudFormation | Its own, empty |
 * | **Migrated** | `false` | Imports them by physical name | Shared with every other migrated stage |
 *
 * **A new environment creates everything.** That is the default the console
 * writes, and it is the one that makes "deploy to a new environment" mean what it
 * sounds like: new tables, a new bucket, a new distribution, a new user pool, all
 * empty, and named so that two environments cannot collide.
 *
 * The fields here mirror `infra/src/config.ts` exactly, because the two files
 * read the same document: a field this file forgot would be one the console
 * silently dropped on the next save.
 */

export interface StageOwnership {
  tables: boolean;
  media: boolean;
  auth: boolean;
}

/**
 * What a stage that says nothing about ownership means.
 *
 * Everything owned — **the opposite default to the one a migrated repository
 * has**, and deliberately so. Achar has no versions of itself older than this CDK
 * app: every stage's resources are created by the stacks that name it, and a
 * config written without the field is asking for the default rather than for an
 * import. `infra/src/config.ts`'s `OWN_EVERYTHING` is the same value, and the two
 * have to agree or a synth and a console would disagree about what a file means.
 */
export const OWN_EVERYTHING: StageOwnership = { tables: true, media: true, auth: true };

export function ownershipOf(config: StageConfig | null): StageOwnership {
  const stated = config?.ownership;
  if (!stated) return OWN_EVERYTHING;
  return {
    tables: stated.tables === true,
    media: stated.media === true,
    auth: stated.auth === true,
  };
}

/** True when this environment creates all of its own stateful resources. */
export function ownsEverything(config: StageConfig | null): boolean {
  const ownership = ownershipOf(config);
  return ownership.tables && ownership.media && ownership.auth;
}

/** The resources an importing stage names, by physical name. */
export interface ExistingResources {
  tables?: Record<string, string>;
  assetsBucket?: string;
  cloudFrontDistributionId?: string;
  cloudFrontDomain?: string;
  userPoolId?: string;
  userPoolClientId?: string;
  userPoolDomain?: string;
  googleSignInEnabled?: boolean;
}

export interface StageConfig {
  stage: string;
  account: string;
  region: string;
  /**
   * The resources this stage imports, by physical name.
   *
   * Absent on an environment that owns everything — there is nothing to name.
   */
  existing?: ExistingResources;
  /**
   * What to call the bucket a stage that **creates** its media gets.
   *
   * Absent by default, and absent is the better answer: an S3 bucket name is
   * unique across *every* AWS account, so `achar-<stage>-assets` is a name some
   * other account may simply own.
   */
  assetsBucketName?: string;
  mail?: {
    fromAddress?: string;
    appBaseUrl?: string;
    studioBaseUrl?: string;
    consoleBaseUrl?: string;
  };
  auth?: {
    googleClientId?: string;
    callbackUrls?: string[];
    logoutUrls?: string[];
  };
  /** The Secrets Manager secret a created pool reads the Google client secret from. */
  googleClientSecretName?: string;
  ownership?: StageOwnership;
  [key: string]: unknown;
}

export function configFile(stage: string): string {
  return repoPath("infra", "config", `achar-${stage}.json`);
}

/**
 * Where a **created** user pool reads the Google client secret from.
 *
 * Secrets Manager rather than SSM, and not by preference:
 * `AWS::Cognito::UserPoolIdentityProvider` rejects an SSM Secure reference in
 * `ProviderDetails.client_secret` outright, and rejects it in
 * `AWS::SecretsManager::Secret`'s own `SecretString` too — so the value cannot
 * even be moved across declaratively. A `secretsmanager` reference *is* accepted
 * there.
 *
 * **Per stage**, because this is a credential an environment is configured with
 * rather than shared state. Mirrors `infra/src/config.ts`.
 */
export function googleClientSecretName(stage: string): string {
  return `achar/${stage}/google-client-secret`;
}

export function readConfig(stage: string): StageConfig | null {
  try {
    const text = fs.readFileSync(configFile(stage), "utf8");
    const parsed = JSON.parse(text) as StageConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Writes a config file, creating `infra/config` if it is not there. */
export function writeConfig(config: StageConfig): string {
  const file = configFile(config.stage);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return file;
}

/**
 * The stage a **new** environment's product settings are copied from.
 *
 * `dev` first — it is the stage that exists in every checkout — then any other
 * stage whose file is complete. A stage in a different account is refused rather
 * than noticed later, because the account is what the borrowed names are built
 * from.
 *
 * What is copied is deliberately only the settings that describe *the product*
 * rather than this environment: the mail addresses, the Google client id and the
 * callback and logout URLs. The data — the physical table names, the bucket, the
 * pool — never is, and that is the difference between a new environment and a
 * second front door to `dev`'s database.
 */
export function pickSeedStage(stage: string): string | null {
  const candidates = listStages().filter((candidate) => candidate !== stage);
  const ordered = candidates.sort((a, b) => (a === "dev" ? -1 : b === "dev" ? 1 : 0));
  for (const candidate of ordered) {
    const loaded = readConfig(candidate);
    if (loaded && configProblems(loaded).length === 0) return candidate;
  }
  return null;
}

export interface NewStageInput {
  /** The account the console is acting as, which is what the deploy will use. */
  account?: string | null;
  region?: string | null;
  /** What a person supplied, when the console has asked them. Beats the seed's copy. */
  auth?: StageConfig["auth"];
  mail?: StageConfig["mail"];
  /** The product values a draft was drawn with, when there is no other stage. */
  fallback?: StageConfig | null;
}

/**
 * The config file a **new environment** gets.
 *
 * `ownership` is all three `true`, which is the whole of the difference between
 * creating the tables, the bucket, the distribution and the pool and importing
 * somebody else's — and there is deliberately no `existing` block, because there
 * is nothing to name. Seeding a new stage from another stage's file would copy
 * its physical table names along with it: a stage that reads like a new
 * environment and behaves like a second front door to the same database.
 *
 * The product settings — mail, the Google client, the callback and logout URLs —
 * *are* carried over, because a stage that invented its own would be a stage
 * whose content API answers on an origin nothing accepts.
 */
export function newStageConfig(
  stage: string,
  seed: StageConfig | null,
  input: NewStageInput = {},
): StageConfig {
  const product = seed ?? input.fallback ?? null;
  const auth = input.auth ?? product?.auth;
  const mail = input.mail ?? product?.mail;

  return {
    stage,
    account: input.account ?? product?.account ?? "",
    region: input.region ?? product?.region ?? "us-east-1",
    ownership: { tables: true, media: true, auth: true },
    ...(mail ? { mail } : {}),
    ...(auth ? { auth } : {}),
    googleClientSecretName: googleClientSecretName(stage),
  };
}

/**
 * Why a config file is not usable, or an empty list when it is.
 *
 * The same checks `infra/src/config.ts` makes at synth, said here so the deploy
 * console can fail on step three instead of on the stack that could not be
 * built — and said in terms of what is missing rather than in terms of what
 * threw.
 *
 * A physical name is required exactly when `ownership` says that group is
 * imported. An environment that owns its tables is not asked for ten names it
 * was never going to have; an environment that imports them cannot leave one
 * out.
 */
export function configProblems(config: StageConfig | null): string[] {
  if (!config) return ["the file does not exist, or is not JSON"];
  const problems: string[] = [];
  for (const field of ["stage", "account", "region"] as const) {
    if (!config[field]) problems.push(`${field} is empty`);
  }

  const ownership = ownershipOf(config);
  const imported: Record<string, readonly (keyof ExistingResources)[]> = {};
  if (!ownership.tables) imported.tables = [];
  if (!ownership.media) {
    imported.media = ["assetsBucket", "cloudFrontDistributionId", "cloudFrontDomain"];
  }
  if (!ownership.auth) {
    imported.auth = ["userPoolId", "userPoolClientId", "userPoolDomain"];
  }
  if (Object.keys(imported).length === 0) return problems;

  if (!config.existing) {
    problems.push(
      `ownership imports ${Object.keys(imported).join(", ")}, so 'existing' is required — ` +
        "an environment that imports a resource has to name it",
    );
    return problems;
  }

  if (!ownership.tables && Object.keys(config.existing.tables ?? {}).length === 0) {
    problems.push("existing.tables is empty");
  }
  for (const [block, fields] of Object.entries(imported)) {
    for (const field of fields) {
      if (!config.existing[field]) {
        problems.push(`existing.${String(field)} is empty (imported ${block})`);
      }
    }
  }
  return problems;
}

/**
 * Every stage this repository knows about.
 *
 * The config directory is the list, because a stage without a config file cannot
 * be deployed — `loadConfig` throws at synth. `dev` is added whether or not the
 * file is there, since it is the stage a fresh checkout means.
 */
export function listStages(): string[] {
  const dir = repoPath("infra", "config");
  const stages = new Set<string>(["dev"]);
  try {
    for (const entry of fs.readdirSync(dir)) {
      const match = /^achar-(.+)\.json$/.exec(entry);
      if (match) stages.add(match[1]);
    }
  } catch {
    // No config directory: `dev` is still the right guess.
  }
  return [...stages].sort((a, b) => (a === "dev" ? -1 : b === "dev" ? 1 : a.localeCompare(b)));
}

/* ------------------------------------------------------------------ *
 * The values an app needs, read out of four stacks
 * ------------------------------------------------------------------ */

export interface StageOutputs {
  apiUrl: string | null;
  apiId: string | null;
  routeCount: number | null;
  assetsBucketName: string | null;
  cloudFrontDomain: string | null;
  /**
   * The distribution's id, which no rule can derive.
   *
   * CloudFront assigns it, and the media stack publishes it — which is why a
   * delete has to read it *before* the stack that carries it goes away, and why
   * it is part of the outputs rather than read at the moment it is needed.
   */
  cloudFrontDistributionId: string | null;
  userPoolId: string | null;
  userPoolClientId: string | null;
  cognitoDomain: string | null;
  googleSignInEnabled: boolean;
  googleCallbackUrl: string | null;
  webhookQueueUrl: string | null;
  /** The Data stack's `<TableId>Name` outputs, by logical id. */
  tables: Record<string, string>;
  /** The environment variables a frontend is handed, ready to spread. */
  env: Record<string, string>;
}

/**
 * Reads the four stacks an app's values come from and flattens their outputs.
 *
 * One `describe-stacks` per stack, in parallel, rather than a single account-wide
 * call: this is asked on a page about *one* environment, and the account-wide
 * snapshot is what the list uses. The split is the stacks' own: the API URL from
 * the API stack, the pool, its client and its Hosted UI domain from the auth
 * stack, the region from the config rather than from any stack, because a region
 * is what the client is told to send its tokens to and it is not an output.
 */
export async function stageOutputs(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<StageOutputs> {
  const [api, auth, media, webhook, data] = await describeStacks(
    [
      `AcharApiStack-${stage}`,
      `AcharAuthStack-${stage}`,
      `AcharMediaStack-${stage}`,
      `AcharWebhookStack-${stage}`,
      `AcharDataStack-${stage}`,
    ],
    ctx,
  );

  const apiUrl = api?.outputs.ApiUrl ?? null;
  const apiId = api?.outputs.ApiId ?? null;
  const routeCount = api?.outputs.RouteCount ? Number(api.outputs.RouteCount) : null;
  const assetsBucketName = media?.outputs.AssetsBucketName ?? null;
  const cloudFrontDomain = media?.outputs.CloudFrontDomain ?? null;
  const cloudFrontDistributionId = media?.outputs.CloudFrontDistributionId ?? null;
  const userPoolId = auth?.outputs.UserPoolId ?? null;
  const userPoolClientId = auth?.outputs.UserPoolClientId ?? null;
  const cognitoDomain = auth?.outputs.UserPoolDomain ?? null;
  // The output is a string on the wire: `GoogleSignInEnabled` is `"true"` or
  // `"false"`, and `Boolean("false")` is `true` — which is exactly the kind of
  // mistake that makes a card claim Google sign-in is on when it is not.
  const googleSignInEnabled = auth?.outputs.GoogleSignInEnabled === "true";

  const tables: Record<string, string> = {};
  for (const [key, value] of Object.entries(data?.outputs ?? {})) {
    const match = /^(\w+Table)Name$/.exec(key);
    if (match) tables[match[1]] = value;
  }

  const region = ctx.region ?? readConfig(stage)?.region ?? defaultRegion();
  const env = frontendEnvValues(
    {
      apiUrl,
      userPoolId,
      userPoolClientId,
      cognitoDomain,
      region,
    },
    region,
  );

  return {
    apiUrl,
    apiId,
    routeCount: Number.isFinite(routeCount) ? routeCount : null,
    assetsBucketName,
    cloudFrontDomain,
    cloudFrontDistributionId,
    userPoolId,
    userPoolClientId,
    cognitoDomain,
    googleSignInEnabled,
    googleCallbackUrl: auth?.outputs.GoogleCallbackUrl ?? null,
    webhookQueueUrl: webhook?.outputs.WebhookQueueUrl ?? null,
    tables,
    env,
  };
}

/* ------------------------------------------------------------------ *
 * The frontends' `.env.local`
 * ------------------------------------------------------------------ */

/**
 * The five variables every app is handed, in the order an app reads them.
 *
 * One list, because three things have to agree about it: the file the deploy plan
 * writes, the table the frontend's Env tab draws, and the environment a dev server
 * is spawned with. Three copies would be three chances for an app to be started
 * with a name no other part of the console knows.
 */
export const FRONTEND_ENV_KEYS = [
  "NEXT_PUBLIC_ACHAR_API_URL",
  "NEXT_PUBLIC_ACHAR_REGION",
  "NEXT_PUBLIC_ACHAR_USER_POOL_ID",
  "NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID",
  "NEXT_PUBLIC_ACHAR_AUTH_DOMAIN",
] as const;

export type FrontendEnvKey = (typeof FRONTEND_ENV_KEYS)[number];

/** Where one app's `.env.local` is. */
export function frontendEnvPath(app: AppKey): string {
  return repoPath("apps", app, ".env.local");
}

export interface FrontendEnvSource {
  apiUrl: string | null;
  userPoolId: string | null;
  userPoolClientId: string | null;
  cognitoDomain: string | null;
  region: string;
}

/**
 * The five names, filled in from a stage's outputs.
 *
 * A value with no output behind it is **left out** rather than written empty: an
 * app that finds `NEXT_PUBLIC_ACHAR_AUTH_DOMAIN=` set to nothing takes it as
 * configured and fails at sign-in, where one that finds the key absent can fall
 * back to its own default.
 */
export function frontendEnvValues(
  source: FrontendEnvSource,
  region: string,
): Record<string, string> {
  const values: Record<string, string> = {};
  if (source.apiUrl) values.NEXT_PUBLIC_ACHAR_API_URL = source.apiUrl;
  values.NEXT_PUBLIC_ACHAR_REGION = region;
  if (source.userPoolId) values.NEXT_PUBLIC_ACHAR_USER_POOL_ID = source.userPoolId;
  if (source.userPoolClientId) values.NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID = source.userPoolClientId;
  if (source.cognitoDomain) values.NEXT_PUBLIC_ACHAR_AUTH_DOMAIN = source.cognitoDomain;
  return values;
}

/**
 * One app's `.env.local`, as a map.
 *
 * Read rather than assumed, in more than one place: the deploy plan's ninth step
 * asks whether the file *already* reads this stage's API URL, and the frontend
 * page draws what is in it against what a deploy would write. Both need the file
 * as it is, not as it was left.
 */
export function readFrontendEnv(app: AppKey): Record<string, string> {
  const values: Record<string, string> = {};
  try {
    const text = fs.readFileSync(frontendEnvPath(app), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separator = trimmed.indexOf("=");
      if (separator === -1) continue;
      values[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
    }
  } catch {
    // No `.env.local` yet: every value is missing, which is the answer.
  }
  return values;
}

/**
 * Writes the five variables into one app's `.env.local`, keeping the rest.
 *
 * **Only the keys in `FRONTEND_ENV_KEYS` are replaced.** Everything else in the
 * file is left exactly as it was, which matters because an app's `.env.local`
 * holds things this console did not put there and cannot derive — a demo API
 * token somebody pasted, a feature flag somebody is halfway through trying. A
 * write that rewrote the whole file would make pointing an app at an environment
 * a thing you do only when nothing else is in there.
 *
 * The keys are written in `FRONTEND_ENV_KEYS` order, first, so two environments'
 * files are comparable by eye and a diff after a deploy is the values that
 * changed rather than a reshuffle.
 */
export function writeFrontendEnv(app: AppKey, values: Record<string, string>): string {
  const file = frontendEnvPath(app);
  const existing = readFrontendEnv(app);

  const lines: string[] = [
    "# Written by the Achar console. The NEXT_PUBLIC_ACHAR_* keys are replaced when",
    "# an environment's deploy points the apps at its stacks; anything else here is",
    "# left exactly as it was.",
  ];

  for (const key of FRONTEND_ENV_KEYS) {
    const value = values[key];
    if (value !== undefined) lines.push(`${key}=${value}`);
    else delete existing[key];
  }

  const rest = Object.entries(existing).filter(
    ([key]) => !(FRONTEND_ENV_KEYS as readonly string[]).includes(key),
  );
  if (rest.length > 0) {
    lines.push("");
    for (const [key, value] of rest) lines.push(`${key}=${value}`);
  }

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

/* ------------------------------------------------------------------ *
 * The view the UI draws
 * ------------------------------------------------------------------ */

/**
 * One environment, built from the snapshot the state route already has.
 *
 * The outputs come out of `describe-stacks`' one call rather than a pair of
 * calls per stage: the list draws a row per environment, and a second round trip
 * per row is the difference between a page that settles and one that trickles.
 * The region is the config's — a stage in another region is a stage whose stacks
 * are not in this snapshot, which is what "not deployed" correctly means here.
 */
export function environmentView(
  stage: string,
  all: CloudStack[],
  ctx: { profile?: string; region?: string } = {},
): EnvironmentView {
  const config = readConfig(stage);
  const region = config?.region ?? ctx.region ?? defaultRegion();
  const { root, deployed, partial } = summariseStacks(stage, all);

  const api = all.find((stack) => stack.name === `AcharApiStack-${stage}`);
  const auth = all.find((stack) => stack.name === `AcharAuthStack-${stage}`);
  const outputs: Record<string, string> = {
    ...(api?.outputs ?? {}),
    ...(auth?.outputs ?? {}),
  };

  return {
    stage,
    configPath: path.relative(repoPath(), configFile(stage)),
    hasConfig: config !== null && configProblems(config).length === 0,
    account: config?.account ?? null,
    region,
    tables: Object.keys(config?.existing?.tables ?? {}).length,
    ownership: config?.ownership ?? null,
    ownsEverything: ownsEverything(config),
    stacks: root,
    deployed,
    partial,
    apiUrl: outputs.ApiUrl ?? null,
    userPoolId: outputs.UserPoolId ?? null,
    userPoolClientId: outputs.UserPoolClientId ?? null,
    cognitoDomain: outputs.UserPoolDomain ?? null,
    googleSignInEnabled: outputs.GoogleSignInEnabled === "true",
  };
}

export function consoleDefaults(): { profile: string; profileSource: ProfileSource; region: string } {
  const { profile, source } = profileSetting();
  return { profile, profileSource: source, region: defaultRegion() };
}
