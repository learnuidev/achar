/**
 * The shapes the console's server and its browser agree on.
 *
 * One file, imported from both sides, for the same reason `@achar/types` exists:
 * a field added to an API response is added in one place and both halves see
 * it. Everything here is JSON — it crosses a `fetch`, and anything that is not
 * (a `ChildProcess`, a timer) stays on the server.
 *
 * The console has its own copy rather than importing `@achar/types`, and that is
 * the same decision as having no `@achar/ui`: this app describes a deployment,
 * and a description that shares a type with the thing it describes goes stale
 * exactly when it is needed. What is in here is what a *page* draws, which is
 * not the same list as what a handler returns.
 */

export type LogStream = "out" | "err" | "note";

export interface LogLine {
  /** Monotonic within a run, so a client can stitch a stream back together. */
  seq: number;
  at: number;
  stream: LogStream;
  text: string;
}

export type StepStatus =
  | "pending"
  | "running"
  /** The step did work, and it worked. */
  | "passed"
  /** The step was already satisfied — the check found nothing to do. */
  | "skipped"
  /** Optional, attempted, did not work. The run carries on. */
  | "warned"
  /**
   * Reported, and deliberately not done.
   *
   * A step whose right answer depends on something the console cannot know — how
   * far an environment's deploy should go, for instance — ends here rather than
   * being applied on somebody's behalf. It is finished, it did not fail, and it
   * is the one state that is asking for a person.
   */
  | "manual"
  | "failed"
  /** Never reached: an earlier step stopped the run. */
  | "halted";

export interface StepView {
  id: string;
  /** One short sentence, sentence case: what this step is. */
  title: string;
  /** Why it exists, in the repository's own words. Shown when a row is open. */
  detail: string;
  /** Optional steps can fail without failing the run. */
  optional: boolean;
  /** What the chip says when the check found it already done. */
  satisfiedLabel: string;
  status: StepStatus;
  /** What the check found, or what the work did. One line. */
  note: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** Lines the transcript dropped to stay inside its cap. */
  droppedLines: number;
}

export type RunStatus = "running" | "succeeded" | "failed" | "cancelled";

/**
 * What a run does.
 *
 * One engine, three directions: a **deploy** takes a stage from nothing to five
 * complete stacks, a **destroy** takes it back to none — the five stacks and the
 * config file, and never the data (every stateful resource here is
 * `RemovalPolicy.RETAIN`) — and a **build** is one frontend asked the only
 * question a frontend has, which is whether `next build` succeeds.
 *
 * It is on the run rather than inferred from the steps because the whole console
 * reads it: the chip on a row, the line under a name, what the page calls the
 * thing that is going. A row that said "deploying" over a destroy would be
 * telling somebody the opposite of what is happening to their environment.
 */
export type RunAction = "deploy" | "destroy" | "build";

/**
 * What a run is about.
 *
 * Two runs, one engine: a **backend** run takes an environment from nothing to
 * five complete CloudFormation stacks, and a **frontend** run takes one app from
 * "the variables in `.env.local` point somewhere else" to a build that finished.
 * They share a checklist, a transcript and a cancel button, and they are told
 * apart by this — which is what the page reads to know whether to draw stacks or
 * a bundle beside the result.
 */
export type RunKind = "backend" | "frontend";

export interface StackSummary {
  name: string;
  status: string;
  /** `*_COMPLETE`, which is not the same as `*_COMPLETE` for an update in
   *  progress — but CloudFormation has no such status. See `healthy`. */
  healthy: boolean;
  /** The stacks that are ours, as opposed to the nested ones CDK names. */
  nested: boolean;
}

/**
 * What a deploy published, read off the stacks rather than remembered.
 *
 * One field per output the console actually reads, rather than a loose map: the
 * outputs are the contract between the backend and everything that consumes it,
 * and a name spelled wrong in a map is a blank cell nobody notices.
 */
export interface RunResult {
  apiUrl: string | null;
  apiId: string | null;
  routeCount: number | null;
  assetsBucketName: string | null;
  cloudFrontDomain: string | null;
  userPoolId: string | null;
  userPoolClientId: string | null;
  cognitoDomain: string | null;
  googleSignInEnabled: boolean;
  webhookQueueUrl: string | null;
  stacks: StackSummary[];
}

export interface RunView {
  id: string;
  kind: RunKind;
  /** Which way this run goes. */
  action: RunAction;
  /**
   * The backend environment, in both cases — a build run reads *against* one,
   * because the values it is handed are that environment's outputs.
   */
  stage: string;
  profile: string;
  region: string;
  account: string | null;
  /**
   * A build run only: which app, and the port it serves on. Kept on the view
   * rather than in the page's state so a reload finds the run it left and can
   * still say what it was doing.
   */
  app: AppKey | null;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  steps: StepView[];
  /** A deploy run's root stacks and the outputs an app needs. */
  result: RunResult | null;
  /**
   * A destroy run's account of what it left behind, one thing per line.
   *
   * The result of deleting an environment is not a URL: it is a list of things
   * still in AWS and what they cost the next deploy of the same name. Written by
   * the run's last step out of what it read, and shown when the run is over.
   */
  report: string[] | null;
  /** Why the run stopped, when it did. */
  error: string | null;
}

/**
 * A run as the *list* of environments needs it: what it is about, and how far it
 * has got.
 *
 * Deliberately not a `RunView`. Most of a run is text — each of the eleven steps
 * carries the paragraph explaining why it exists, which is the bulk of the
 * payload and the reason the deploy page is worth reading — and the list asks
 * every three seconds, for every environment at once, to draw a chip and a step
 * number. So it reads this instead: the same facts, without the prose.
 */
export interface RunSummary {
  id: string;
  /** The environment it is about. */
  stage: string;
  /** Which way it goes — so a row can say "deleting" and not "deploying". */
  action: RunAction;
  status: RunStatus;
  startedAt: number;
  /** Which step it is on, and what that step is called. */
  steps: Array<{ id: string; title: string; status: StepStatus }>;
}

/* ------------------------------------------------------------------ *
 * The four frontends
 * ------------------------------------------------------------------ */

export type AppKey = "web" | "studio" | "console" | "demo";
export type ServiceStatus = "stopped" | "starting" | "running" | "failed";

export interface ServiceView {
  app: AppKey;
  name: string;
  /** One sentence: what this app is, in the workspace's own words. */
  blurb: string;
  port: number;
  url: string;
  /**
   * The environment the process was started with. `null` means "whatever its
   * `.env.local` says" — which is how the apps run when nobody has chosen.
   */
  stage: string | null;
  status: ServiceStatus;
  pid: number | null;
  startedAt: number | null;
  /** When the dev server printed its Local URL. */
  readyAt: number | null;
  exitCode: number | null;
  error: string | null;
  /** The API URL the process was handed, so the card can show what it points at. */
  apiUrl: string | null;
  lineCount: number;
  /**
   * Started by an earlier console session and picked up again by this one.
   *
   * The dev server is fine — it is the console that went away — but its output
   * went with the pipes, so the card says as much rather than showing an empty
   * transcript as if the app had nothing to say.
   */
  adopted: boolean;
}

/* ------------------------------------------------------------------ *
 * Environments, and who we are
 * ------------------------------------------------------------------ */

export interface EnvironmentView {
  stage: string;
  configPath: string;
  hasConfig: boolean;
  account: string | null;
  region: string | null;
  /** Tables this environment *imports*. Zero when it creates its own. */
  tables: number;
  ownership: { tables: boolean; media: boolean; auth: boolean } | null;
  /** True when this environment creates the tables, media and pool itself. */
  ownsEverything: boolean;
  stacks: StackSummary[];
  /** Every one of the root stacks is `*_COMPLETE`. */
  deployed: boolean;
  /** Some are there, some are not — the state a failed first deploy leaves. */
  partial: boolean;
  apiUrl: string | null;
  userPoolId: string | null;
  userPoolClientId: string | null;
  cognitoDomain: string | null;
  googleSignInEnabled: boolean;
}

export interface Identity {
  account: string;
  arn: string;
  userId: string;
}

/**
 * What the AWS integration page draws, and what the chrome repeats.
 *
 * `cli` is the part that matters when nothing is configured: a machine with no
 * `aws` at all and a machine whose profile has expired are the same empty page
 * unless the console says which one it is looking at.
 */
export interface AwsCliView {
  installed: boolean;
  /** The binary that would be run, when there is one. */
  path: string | null;
  version: string | null;
}

export interface AwsIntegrationView {
  cli: AwsCliView;
  profile: string;
  profileSource: ProfileSource;
  region: string;
  identity: Identity | null;
  /** Why the identity could not be read — credentials, usually a stale SSO session. */
  identityError: string | null;
  /** The stacks in this account and region that belong to Achar. */
  stacks: StackSummary[];
  /** Tables in this account and region named for an Achar stage. */
  tables: string[];
  /** Buckets whose name begins with the repository's own prefix. */
  buckets: string[];
}

export interface ConsoleState {
  repoRoot: string;
  profile: string;
  profileSource: ProfileSource;
  region: string;
  cli: AwsCliView;
  identity: Identity | null;
  /** Why the identity could not be read — credentials, usually a stale SSO session. */
  identityError: string | null;
  environments: EnvironmentView[];
  /** Stages that could be deployed but have no config file yet. */
  suggestions: string[];
}

/**
 * Where the profile name came from.
 *
 * There is one file this repository could read it from and it deliberately does
 * not: the console takes the ambient `AWS_PROFILE`, and says so. A second copy of
 * the name is a second thing to change, and a control room that quietly used a
 * profile nobody chose is the one mistake here with somebody else's account at
 * the end of it.
 */
export type ProfileSource = "AWS_PROFILE" | "default";

/* ------------------------------------------------------------------ *
 * The settings a person supplies
 * ------------------------------------------------------------------ */

/**
 * The half of a federated sign-in that lives in the Google Cloud console.
 *
 * These are not inputs — they are *outputs*, read off the deployment, and the
 * Checklist tab shows them so nobody has to derive a Cognito domain by hand and
 * get `redirect_uri_mismatch` for it.
 */
export interface GoogleOAuthValues {
  cognitoDomain: string | null;
  /** Authorized JavaScript origins. */
  javaScriptOrigin: string | null;
  /** Authorized redirect URIs — Cognito's `/oauth2/idpresponse`. */
  redirectUri: string | null;
}

/**
 * What an environment is configured with, rather than what it is discovered to
 * be. The secret's *value* is never part of this — only whether one is stored.
 */
export interface EnvironmentSettings {
  stage: string;
  configPath: string;
  /**
   * False until the file is written — which is the state a **new** environment
   * is in. Its settings are then a draft: what the deploy *would* configure,
   * carried over from a stage that already has the product's values.
   */
  hasConfig: boolean;
  /** Which environment a draft's product settings were copied from. */
  seededFrom: string | null;
  account: string | null;
  region: string | null;
  ownership: { tables: boolean; media: boolean; auth: boolean };
  /** True when this environment creates its pool, so a provider and secret are needed. */
  needsGoogleSecret: boolean;
  googleClientSecretName: string;
  googleClientSecretSet: boolean;
  auth: {
    googleClientId: string;
    callbackUrls: string[];
    logoutUrls: string[];
  };
  mail: {
    fromAddress: string;
    appBaseUrl: string;
    studioBaseUrl: string;
    consoleBaseUrl: string;
  };
  /** What to paste into the Google Cloud console. */
  oauth: GoogleOAuthValues;
}

export interface EnvironmentSettingsInput {
  auth: {
    googleClientId: string;
    callbackUrls: string[];
    logoutUrls: string[];
  };
  mail: {
    fromAddress: string;
    appBaseUrl: string;
    studioBaseUrl: string;
    consoleBaseUrl: string;
  };
  /**
   * Write-only. Empty or absent leaves whatever is stored alone, so saving the
   * form without retyping the secret does not clear it.
   */
  googleClientSecret?: string;
}

/**
 * What a save wrote, so the page can say it rather than guess.
 *
 * A save is up to three writes with three destinations — the committed config
 * file, Secrets Manager, and the live app client — and "Saved" is not an honest
 * summary of all three.
 */
export interface SettingsWriteView {
  configPath: string;
  /** The file was created by this save rather than updated. */
  created: boolean;
  secretWritten: boolean;
  /** What happened to the live app client, which is the other half of a URL save. */
  authUrls: AuthUrlsWriteView;
}

/**
 * Whether the callback and logout URLs that were just saved reached the pool
 * that is running.
 *
 * The config file is what a **deploy** reads, and a stage that imports its pool
 * has no deploy that can change the URL lists Cognito accepts — an imported
 * resource is unmanaged. A stage that creates its pool gets them twice: the save
 * writes them onto the client as soon as that pool exists, and the auth stack
 * builds the client with the same list from the config file on every deploy.
 */
export interface AuthUrlsWriteView {
  /** Cognito was reached, and now holds the lists that were just saved. */
  applied: boolean;
  /** One sentence: what happened, or why it did not. */
  note: string;
}

/* ------------------------------------------------------------------ *
 * Backends: what a deploy reads and produces, and what it did
 * ------------------------------------------------------------------ */

/**
 * One function of a stage, as its logs are read.
 *
 * The source is **log groups**, not `lambda list-functions`, because
 * `list-functions` is paginated account-wide: filtering it by name in this
 * process would show a stage's Lambdas only if they happened to fall in the
 * first page. A prefix query is filtered by the service, so it is complete
 * whatever else the account holds — and it is the more honest source for a tab
 * that reads logs, because a function with no log group is a function this tab
 * has nothing to say about.
 */
export interface BackendFunctionView {
  /** The deployed Lambda name: `achar-<stage>-<key>`. */
  name: string;
  key: string;
  logGroup: string;
  /** How many bytes of log data this function's group holds. */
  storedBytes: number;
  /** Days it keeps its events, or null when it is set never to forget. */
  retentionDays: number | null;
  /** Never answers a request, so nowhere else to say anything. */
  eventDriven: boolean;
}

export interface LogEventView {
  at: number;
  stream: string;
  message: string;
}

export interface BackendLogs {
  function: string;
  logGroup: string;
  events: LogEventView[];
  /** Why the list is empty, when it is — "nothing ran" beats a blank panel. */
  note: string | null;
}

/* ------------------------------------------------------------------ *
 * What a function did
 * ------------------------------------------------------------------ */

/**
 * One time slot of a function's activity.
 *
 * **Dense, including the quiet slots.** CloudWatch omits a period in which
 * nothing happened rather than answering with a zero, so a chart drawn straight
 * from its datapoints would compress an idle hour into a single pixel — which is
 * the one thing a chart of "is this thing running" must not do. The server fills
 * the gaps, and `durationP95` stays `null` there rather than becoming `0`: no
 * invocations is not a fast response.
 */
export interface MetricBucket {
  /** The bucket's start, epoch milliseconds. */
  at: number;
  invocations: number;
  errors: number;
  /** Milliseconds, or null when nothing ran in this slot. */
  durationP95: number | null;
}

export interface FunctionMetrics {
  function: string;
  /** The window that was asked for, in minutes. */
  minutes: number;
  /** How wide each bucket is, in seconds. */
  periodSeconds: number;
  buckets: MetricBucket[];
  totals: {
    invocations: number;
    errors: number;
    /** The worst p95 in the window — what "how slow does it get" means. */
    durationP95: number | null;
  };
  /**
   * Why there is nothing to draw, when there is nothing. A function nobody has
   * called and a function whose metrics are not published yet are different
   * answers, and the chart cannot tell them apart on its own.
   */
  note: string | null;
}

/* ------------------------------------------------------------------ *
 * The tables an environment reads
 * ------------------------------------------------------------------ */

/**
 * One table, as the list of them draws it.
 *
 * `key` is the label and `name` is the physical table, and both are shown: the
 * label is what a person scans for (`DocumentsTable`) and the name is the string
 * that goes into a CLI (`achar-dev-documents-table`). They differ because the
 * two kinds of table are named by different things — see `server/tables.ts`.
 */
export interface TableSummaryView {
  /** The physical name in this account. */
  name: string;
  /** The logical id the config uses, or the name with the stage prefix taken off. */
  key: string;
  /** The config's own key, for a stage that imports its data. Null when created. */
  logical: string | null;
  /** Named by the config, so no deploy here can change or delete it. */
  imported: boolean;
}

export interface TableSummaryList {
  tables: TableSummaryView[];
  note: string | null;
}

export interface TableKeyView {
  name: string;
  /** `S`, `N` or `B` — what the attribute is stored as. */
  type: string;
  kind: "HASH" | "RANGE";
}

export interface TableIndexView {
  name: string;
  keys: TableKeyView[];
  projection: string;
}

/**
 * What a table *is*, as `DescribeTable` answers.
 *
 * `itemCount` and `sizeBytes` are DynamoDB's own figures, which are updated
 * about every six hours rather than per write — so the tab says so beside them.
 * A count that is a few hours stale is still the only count there is: getting a
 * live one means counting every row.
 */
export interface TableDetailView {
  name: string;
  status: string;
  itemCount: number;
  sizeBytes: number;
  billingMode: string | null;
  created: number | null;
  keys: TableKeyView[];
  indexes: TableIndexView[];
  /**
   * The attributes a `Query` can be answered from — the table's partition key and
   * each index's — as labels like `projectId via ProjectIndex`.
   */
  targets: string[];
}

/**
 * One row, exactly as DynamoDB answered it: `{ projectId: { S: "prj_…" } }`.
 *
 * The wire format and not a flattened one, because the same read is drawn twice
 * — as a table and as JSON — and a mapping done on the server would be a second
 * answer to "what does this row say" that only one of the two renderings used.
 * `lib/dynamo.ts` is the one place it is turned into something a person reads.
 */
export type DynamoRow = Record<string, unknown>;

/**
 * A page of rows, and what reading them cost.
 *
 * `scanned` against `matched` is the number that matters on a filtered read:
 * DynamoDB applies a filter *after* it has read the rows, so a scan that returns
 * five rows may have read fifty thousand, and the two counts are the only place
 * that is visible from a browser.
 */
export interface TableItemsView {
  rows: DynamoRow[];
  matched: number;
  scanned: number;
  /** The CLI's own cursor for the next page, opaque and handed back untouched. */
  token: string | null;
  /**
   * Which call answered it. A `Query` needs a partition key and reads what it
   * returns; a `Scan` reads the table to find it.
   */
  via: "query" | "scan";
  /** The read, written out — `Query on the key: projectId = "prj_…"`. */
  expression: string | null;
  /**
   * What the value was compared as: `S`, `N` or `BOOL`.
   *
   * Sent back because the form may have left it to the table to decide, and
   * because it is the answer to the question a read that matched nothing raises:
   * an `N` compared as an `S` matches nothing, and the type is the half of that
   * nobody can see in the value they typed. Null when nothing was compared.
   */
  valueType: string | null;
  indexName: string | null;
  note: string | null;
}

/**
 * One row of an environment's variables.
 *
 * The same shape for a **backend's inputs** (what a deploy reads: the Google
 * client, the callback URLs, the mail sender), its **outputs** (what it
 * produces: the API URL, the pool, its client and domain), and a **frontend's**
 * variables, because they are all "a name, a value, and where it comes from" —
 * and the interesting part of every one of them is that last clause.
 */
export interface EnvRow {
  key: string;
  /** Null when the value is a secret, or when there is nothing to show yet. */
  value: string | null;
  /** Where it comes from, in the environment's own words. */
  source: string;
  /** A credential: reported as set or not, never echoed. */
  secret?: boolean;
  /** Written by the Settings form rather than by a deploy. */
  editable?: boolean;
  /** Which surface reads it — how a value here reaches a browser. */
  usedBy?: string[];
}

export interface BackendEnvView {
  stage: string;
  inputs: EnvRow[];
  outputs: EnvRow[];
}

export interface FrontendEnvView {
  app: AppKey;
  stage: string;
  rows: EnvRow[];
  /** The app is running locally against *this* stage right now. */
  running: boolean;
}

/** A CloudFormation stack event: what actually happened, and when. */
export interface DeploymentEventView {
  at: number;
  stack: string;
  status: string;
  reason: string | null;
  resource: string | null;
}

export interface DeploymentHistoryView {
  stage: string;
  events: DeploymentEventView[];
  note: string | null;
}

/* ------------------------------------------------------------------ *
 * What crosses the wire
 * ------------------------------------------------------------------ */

export type DeployEvent =
  | { type: "run"; run: RunView; at: number }
  | { type: "step"; step: StepView; at: number }
  | { type: "log"; stepId: string; line: LogLine }
  | { type: "end"; run: RunView; at: number };

/**
 * The dev servers' own stream.
 *
 * The four apps are one server each and one thing to watch each, so one stream
 * carries all of them — and a build, when one is going, is a run rather than a
 * service: it has steps and a transcript, and it is drawn with the same
 * checklist a deploy is.
 */
export type ServiceEvent =
  | { type: "services"; services: ServiceView[]; at: number }
  | { type: "log"; app: AppKey; line: LogLine }
  | { type: "status"; service: ServiceView; at: number }
  | { type: "run"; run: RunView; at: number }
  | { type: "step"; runId: string; step: StepView; at: number }
  | { type: "end"; run: RunView; at: number };
