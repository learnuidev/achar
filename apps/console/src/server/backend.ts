import type { BackendEnvView, DeploymentEventView, DeploymentHistoryView, EnvRow } from "@/lib/types";
import { awsJson, ROOT_STACKS } from "./aws";
import { googleSecretStatus, readSettings, settingsContext } from "./settings";

/**
 * A backend environment, described the two ways that matter: what you put in,
 * and what comes out.
 *
 * ## Inputs and outputs are not "variables"
 *
 * The interesting thing about this backend is that almost nothing it runs on is
 * typed in as an environment variable. It is two different directions:
 *
 * - **Inputs** are what a *person* supplies, because nothing can discover them:
 *   the Google OAuth client and its secret, the origins Cognito will accept, the
 *   address invitations come from, and where the four apps live. They are
 *   written by the Settings form and read by a deploy.
 * - **Outputs** are what the *deploy* produces — the API URL, the assets bucket
 *   and its distribution, the pool, its app client, the Hosted UI domain, the
 *   delivery queue, every table's name — and they are consumed by something else
 *   entirely: the four frontends, or the handlers themselves. They are the
 *   answer to "which environment is this app pointed at", and the reason a
 *   frontend's own view is just these rows with a different `usedBy`.
 *
 * Calling both of them "environment variables" would hide the only thing worth
 * knowing about either: which direction the value travels, and who reads it.
 */

/**
 * The apps and the parts of the deployment that consume each output, so the
 * frontend view can be the same rows.
 *
 * `ApiUrl`, the pool, its client and its domain are the four `NEXT_PUBLIC_*`
 * values every app is handed — the fifth, the region, is a property of the
 * environment rather than something a stack publishes, so it is not in this map.
 * The rest are read by the deployment itself: a handler's own environment has
 * the bucket it presigns into and the queue it publishes to, which is why those
 * rows name functions rather than apps.
 */
export const CONSUMERS: Record<string, string[]> = {
  ApiUrl: ["app", "console", "demo"],
  UserPoolId: ["app", "console", "demo"],
  UserPoolClientId: ["app", "console", "demo"],
  UserPoolDomain: ["app", "console", "demo"],
  // A person, not an app: sign-in is disabled until the client id and secret are
  // right, and the Checklist tab is where they are supplied. Nothing in this
  // repository reads the flag.
  GoogleSignInEnabled: ["the Checklist tab"],
  AssetsBucketName: ["create-asset-upload-url", "commit-asset", "delete-asset"],
  // Every asset URL the API returns is built from this domain (`assetUrl` in
  // `services/api/src/lib/assets.ts`), so its consumers are the handlers that
  // hand a browser a URL rather than a row.
  CloudFrontDomain: ["list-assets", "get-document", "query-documents"],
  // The one output a person has to act on outside this repository: a redirect
  // URI is pasted into the Google Cloud console, and the thing that redirects is
  // Google's own service.
  GoogleCallbackUrl: ["the Google Cloud console"],
  WebhookQueueUrl: ["mutate-documents"],
};

/**
 * The four values `docs/deploy.md` calls "the backend variables" — the outputs
 * a frontend is handed as `NEXT_PUBLIC_*`.
 *
 * Four and not five: the region every app also reads is the environment's own,
 * not something a stack publishes, so it comes from the config rather than from
 * this list.
 */
export const FRONTEND_OUTPUTS = [
  "ApiUrl",
  "UserPoolId",
  "UserPoolClientId",
  "UserPoolDomain",
];

/** Output key → the `NEXT_PUBLIC_*` name a frontend receives it as. */
export const OUTPUT_ENV_NAME: Record<string, string> = {
  ApiUrl: "NEXT_PUBLIC_ACHAR_API_URL",
  UserPoolId: "NEXT_PUBLIC_ACHAR_USER_POOL_ID",
  UserPoolClientId: "NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID",
  UserPoolDomain: "NEXT_PUBLIC_ACHAR_AUTH_DOMAIN",
};

/**
 * The ten tables the data stack owns, by the logical id the config and the
 * stacks use.
 *
 * This is the console's copy of a list that belongs to `infra/src/generated/service.ts`,
 * and it is here because the console may not import the infrastructure: a
 * control room that read its table list from the thing it deploys could not tell
 * you about a deploy that never happened. The ids are stable — a rename would be
 * a migration — and the pair of names they produce is what this file needs:
 * `DocumentsTable` is the `DocumentsTableName` output, which is read as
 * `DOCUMENTS_TABLE`.
 */
const TABLE_IDS = [
  "ProjectsTable",
  "MembersTable",
  "DatasetsTable",
  "SchemasTable",
  "DocumentsTable",
  "AssetsTable",
  "TokensTable",
  "WebhooksTable",
  "DeliveriesTable",
  "ProfilesTable",
] as const;

/** What each table's name is read as inside a handler. */
const TABLE_ENV: Record<string, string> = {
  ProjectsTable: "PROJECTS_TABLE",
  MembersTable: "MEMBERS_TABLE",
  DatasetsTable: "DATASETS_TABLE",
  SchemasTable: "SCHEMAS_TABLE",
  DocumentsTable: "DOCUMENTS_TABLE",
  AssetsTable: "ASSETS_TABLE",
  TokensTable: "TOKENS_TABLE",
  WebhooksTable: "WEBHOOKS_TABLE",
  DeliveriesTable: "DELIVERIES_TABLE",
  ProfilesTable: "PROFILES_TABLE",
};

/** `DocumentsTable` → `DocumentsTableName`, the output the data stack publishes. */
function tableOutput(id: string): string {
  return `${id}Name`;
}

export const OUTPUT_LABEL: Record<string, string> = {
  ApiUrl: "REST API base URL",
  ApiId: "API Gateway id",
  RouteCount: "routes on the API",
  AssetsBucketName: "assets bucket",
  CloudFrontDomain: "CloudFront distribution",
  UserPoolId: "Cognito user pool",
  UserPoolClientId: "Cognito app client",
  UserPoolDomain: "Cognito Hosted UI domain",
  GoogleSignInEnabled: "Google sign-in enabled",
  GoogleCallbackUrl: "redirect URI for the Google Cloud console",
  WebhookQueueUrl: "webhook delivery queue",
};

/** The line under a table's output key: which variable a handler reads it as. */
function tableSource(id: string): string {
  return `Data stack — the name a handler reads as ${TABLE_ENV[id] ?? id}`;
}

/**
 * What this environment reads, and what it produces.
 *
 * The inputs come from the config file and Secrets Manager; the outputs from the
 * stacks that publish them. A missing output is a stage that has not deployed,
 * which is reported as a row with no value rather than as an absence — the
 * absence is the useful information.
 */
export async function backendEnv(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<BackendEnvView> {
  const settings = readSettings(stage);
  const secretSet = await googleSecretStatus(stage, ctx).catch(() => false);

  // Whether this environment creates its pool decides whether the Google rows
  // are requirements or facts: a stage that imports a pool someone else built
  // needs no provider and no secret, and saying otherwise would send somebody
  // looking for credentials they cannot supply.
  const createsPool = settings?.needsGoogleSecret ?? false;

  const inputs: EnvRow[] = [
    {
      key: "Google client id",
      value: settings?.auth.googleClientId || null,
      source: "Settings — the OAuth client Cognito signs in with",
      editable: true,
      usedBy: createsPool ? ["the pool this environment creates"] : ["the pool this environment imports"],
    },
    {
      key: "Google client secret",
      value: null,
      source: secretSet
        ? `Secrets Manager — ${settings?.googleClientSecretName ?? ""}`
        : "not set — see the Checklist tab",
      secret: true,
      editable: true,
      usedBy: createsPool ? ["the identity provider"] : ["nothing (imported pool)"],
    },
    {
      key: "Callback URLs",
      value: settings?.auth.callbackUrls.join(", ") || null,
      source: "Settings — origins Cognito will return a sign-in to",
      editable: true,
      usedBy: ["app", "console", "demo"],
    },
    {
      key: "Logout URLs",
      value: settings?.auth.logoutUrls.join(", ") || null,
      source: "Settings — origins Cognito will return a sign-out to",
      editable: true,
      usedBy: ["app", "console", "demo"],
    },
    {
      key: "Mail from address",
      value: settings?.mail.fromAddress || null,
      source: "Settings — MAIL_FROM_ADDRESS, what an invitation is sent as",
      editable: true,
      usedBy: ["invitations"],
    },
    {
      key: "Public site base URL",
      value: settings?.mail.appBaseUrl || null,
      source: "Settings — APP_BASE_URL, the public site in a mailed link",
      editable: true,
      usedBy: ["invitations", "app"],
    },
    {
      key: "Studio base URL",
      value: settings?.mail.studioBaseUrl || null,
      source: "Settings — STUDIO_BASE_URL, where an author is sent — the same app, at /studio",
      editable: true,
      usedBy: ["invitations", "app"],
    },
    {
      key: "Console base URL",
      value: settings?.mail.consoleBaseUrl || null,
      source: "Settings — CONSOLE_BASE_URL, where an operator is sent",
      editable: true,
      usedBy: ["console"],
    },
  ];

  const merged = await stackOutputs(stage, ctx);
  const outputRows: EnvRow[] = OUTPUT_ORDER.map((key) => {
    const table = TABLE_IDS.find((id) => tableOutput(id) === key);
    return {
      key,
      value: merged[key] ?? null,
      source: table ? tableSource(table) : (OUTPUT_LABEL[key] ?? key),
      usedBy: CONSUMERS[key] ?? [],
    };
  });

  return { stage, inputs, outputs: outputRows };
}

/**
 * The order the outputs are shown in: what the frontends need, then the media,
 * the pool, the queue, and last the tables.
 *
 * The five stacks' own order, and the tables last because they are the ten rows
 * that answer a different question — not "where does this app point" but "what
 * is the data actually in", which is what the DynamoDB tab is for.
 */
const OUTPUT_ORDER = [
  "ApiUrl",
  "ApiId",
  "RouteCount",
  "AssetsBucketName",
  "CloudFrontDomain",
  "UserPoolId",
  "UserPoolClientId",
  "UserPoolDomain",
  "GoogleSignInEnabled",
  "GoogleCallbackUrl",
  "WebhookQueueUrl",
  ...TABLE_IDS.map(tableOutput),
];

interface RawStack {
  Outputs?: Array<{ OutputKey?: string; OutputValue?: string }>;
}

/**
 * Every output of **this stage's** root stacks.
 *
 * Five named reads rather than one unfiltered `describe-stacks`: that call
 * without a `--stack-name` returns every stack in the account, so `ApiUrl` from
 * `dev` would land in the staging row and the page would confidently report the
 * wrong API. Which is the one mistake a page about "which environment is this"
 * must not make.
 */
export async function stackOutputs(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<Record<string, string>> {
  const names = ROOT_STACKS.map(({ suffix }) => `Achar${suffix}Stack-${stage}`);

  const stacks = await Promise.all(
    names.map((name) =>
      awsJson<RawStack[]>(
        ["cloudformation", "describe-stacks", "--stack-name", name, "--query", "Stacks"],
        { ...ctx, optional: true },
      ).catch(() => null),
    ),
  );

  const merged: Record<string, string> = {};
  for (const body of stacks) {
    for (const stack of body ?? []) {
      for (const output of stack.Outputs ?? []) {
        if (output.OutputKey && output.OutputValue !== undefined) {
          merged[output.OutputKey] = output.OutputValue;
        }
      }
    }
  }
  return merged;
}

interface RawEvent {
  Timestamp?: string;
  StackName?: string;
  ResourceStatus?: string;
  ResourceType?: string;
  LogicalResourceId?: string;
  ResourceStatusReason?: string;
}

/**
 * What has actually been deployed, from CloudFormation rather than from a log
 * this process keeps.
 *
 * CloudFormation is the record: it holds every create, update and rollback with
 * the reason, and it survives the console restarting, the repository moving and
 * the last run being forgotten. A deployment history kept on `globalThis` would
 * be a history that begins when you opened the page.
 */
export async function deploymentHistory(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
  limit = 40,
): Promise<DeploymentHistoryView> {
  const names = ROOT_STACKS.map(({ suffix }) => `Achar${suffix}Stack-${stage}`);

  const results = await Promise.all(
    names.map((stackName) =>
      awsJson<RawEvent[]>(
        [
          "cloudformation",
          "describe-stack-events",
          "--stack-name",
          stackName,
          "--max-items",
          "30",
          "--query",
          "StackEvents",
        ],
        { ...ctx, optional: true },
      ).catch(() => null),
    ),
  );

  const events: DeploymentEventView[] = [];
  let missing = 0;

  results.forEach((batch, index) => {
    if (!batch) {
      missing += 1;
      return;
    }
    for (const event of batch) {
      events.push({
        at: event.Timestamp ? Date.parse(event.Timestamp) : 0,
        stack: names[index],
        status: event.ResourceStatus ?? "UNKNOWN",
        resource: event.LogicalResourceId ?? null,
        reason: event.ResourceStatusReason ?? null,
      });
    }
  });

  events.sort((a, b) => b.at - a.at);

  return {
    stage,
    events: events.slice(0, limit),
    note: missing
      ? `${missing} of the root stacks do not exist in this environment yet.`
      : null,
  };
}

export function backendContext() {
  return settingsContext();
}
