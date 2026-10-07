import fs from 'node:fs';
import path from 'node:path';

import { CONFIG_DIR } from './paths.ts';

/**
 * What a deployment stands on, and what it is allowed to touch.
 *
 * The values come from `infra/config/achar-<stage>.json`, which the console
 * writes when a person saves an environment's credentials, and which
 * `scripts/import-state.mjs` can read out of AWS for a stage that already
 * exists. The CDK app does not look anything up at synth time, and that is a
 * decision rather than an omission:
 *
 * - A synth that reaches AWS needs credentials and a network, so `cdk synth` —
 *   the thing that is supposed to be instant and local — stops being either.
 * - A lookup that misses does not fail. `StringParameter.valueFromLookup`
 *   returns the *parameter name* when the parameter does not exist, and that
 *   string is then baked into every Lambda's environment as a table name. The
 *   failure surfaces as a 500 at the first request.
 *
 * The names are also the one thing here a person should read before verifying a
 * change, and a file in the repository can be read.
 */

export interface ExistingResources {
  /**
   * Physical table names, keyed by the logical id — `DocumentsTable` and so on.
   * The logical id is the key because it is also the CDK construct id and the
   * environment variable's name in `src/generated/service.ts`, so one string ties
   * the three together.
   */
  tables: Record<string, string>;
  assetsBucket: string;
  cloudFrontDistributionId: string;
  cloudFrontDomain: string;
  userPoolId: string;
  userPoolClientId: string;
  userPoolDomain: string;
  googleSignInEnabled: boolean;
}

/** Who mail would come from, and where the three apps live. */
export interface MailSettings {
  fromAddress: string;
  appBaseUrl: string;
  studioBaseUrl: string;
  consoleBaseUrl: string;
}

/** What Cognito has to be told, and where it may send people back to. */
export interface AuthSettings {
  googleClientId: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

/**
 * Whether a stack creates a stateful resource or imports the one that already
 * exists.
 *
 * **All three are `true` for a new environment**, which is the normal case: it
 * creates its own tables, bucket, distribution and pool, named `achar-<stage>-*`
 * and empty.
 *
 * `false` means "import this instead of creating it", which is what a stage that
 * predates this CDK app needs. An imported resource is unmanaged: CloudFormation
 * will not change its properties and will not delete it — which is the entire
 * point, because the alternative is a table that CloudFormation *replaces*, and a
 * replaced table is an empty table.
 */
export interface Ownership {
  tables: boolean;
  media: boolean;
  auth: boolean;
}

export interface AcharConfig {
  stage: string;
  account: string;
  region: string;
  /**
   * The names of the resources this environment imports.
   *
   * **Absent on an environment that owns everything**, which is what a new stage
   * is: it imports nothing, so there is nothing to name. It is required exactly
   * to the extent that `ownership` says something is imported, and `validate`
   * checks it field by field rather than demanding the whole block.
   */
  existing?: ExistingResources;
  /**
   * What to call the bucket a stage that **creates** its media gets.
   *
   * Absent by default, and absent is the better answer: an S3 bucket name is
   * unique across *every* AWS account, so `achar-<stage>-assets` is a name some
   * other account may simply own — and CloudFormation then fails early
   * validation with "Resource of type 'AWS::S3::Bucket' with identifier
   * 'achar-dev-assets' already exists", before anything is created.
   *
   * Left out, CloudFormation names the bucket itself: unique by construction, and
   * the physical name is not something a person needs to know, because every
   * consumer reads it from the stack — `AssetsBucketName` is an output, and the
   * handlers get it in their environment.
   */
  assetsBucketName?: string;
  mail: MailSettings;
  auth: AuthSettings;
  /** The Secrets Manager secret a created pool reads the Google client secret from. */
  googleClientSecretName: string;
  /**
   * What translates content, when a stage has decided to pay for it.
   *
   * Absent is a stage that does not translate, and that is the default rather than an
   * oversight: a model call costs money per request, so a deployment that has never
   * been told which model to use answers "not configured" instead of guessing one.
   * See `translationModelOf`.
   */
  translation?: TranslationSettings;
  ownership: Ownership;
}

/**
 * The model a stage translates with.
 *
 * A **Bedrock** model id, and the whole of what this file needs to know about the
 * provider: the handler calls Bedrock with the Lambda's own IAM role, so there is no
 * key here and nothing to rotate. Either form of id works — a foundation model in the
 * deployment's own region (`anthropic.claude-3-5-haiku-20241022-v1:0`) or a
 * cross-region inference profile (`us.anthropic.claude-3-5-haiku-20241022-v1:0`).
 *
 * The account also has to have been granted access to that model in the Bedrock
 * console, which is not something a deploy can do: an ungranted model fails at the
 * first translation, with the provider's own sentence about it rather than a
 * rewritten one.
 */
export interface TranslationSettings {
  model: string;
}

/**
 * The model a stage translates with, or the empty string.
 *
 * The empty string rather than nothing, because an environment variable that is
 * absent and one that is empty are the same thing to a Lambda — and the handler reads
 * both as "this deployment does not translate", which is a 501 naming the variable
 * rather than a guess at a model id.
 */
export function translationModelOf(config: AcharConfig): string {
  return config.translation?.model?.trim() ?? '';
}

/**
 * What a config that says nothing about ownership means.
 *
 * Everything owned, because a config written without the field is a new
 * environment — the console writes `ownership` explicitly, and a hand-written
 * config that omits it is asking for the default rather than for a migration.
 */
export const OWN_EVERYTHING: Ownership = {
  tables: true,
  media: true,
  auth: true,
};

/** The same switch, with the "not stated" case resolved. */
export function ownershipOf(config: AcharConfig): Ownership {
  return config.ownership ?? OWN_EVERYTHING;
}

/** True when this environment creates all of its own stateful resources. */
export function ownsEverything(config: AcharConfig): boolean {
  const ownership = ownershipOf(config);
  return ownership.tables && ownership.media && ownership.auth;
}

/**
 * Where a **created** user pool reads the Google client secret from.
 *
 * Secrets Manager rather than SSM, and not by preference:
 * `AWS::Cognito::UserPoolIdentityProvider` rejects an SSM Secure reference in
 * `ProviderDetails.client_secret` outright — "SSM Secure reference is not
 * supported in: [...]" — and rejects it in `AWS::SecretsManager::Secret`'s
 * `SecretString` too, so the value cannot even be moved across declaratively. A
 * `secretsmanager` reference *is* accepted there.
 *
 * **Per stage**, unlike nothing else here: this is a credential an environment is
 * configured with rather than shared state, and the console's Checklist tab
 * writes one per environment.
 */
export function googleClientSecretName(stage: string): string {
  return `achar/${stage}/google-client-secret`;
}

/** Where `import-state.mjs` writes, and where this reads. */
export function configPath(stage: string): string {
  return path.join(CONFIG_DIR, `achar-${stage}.json`);
}

/**
 * The ports the apps run on, which is what a default has to agree with.
 *
 * `demo` is here although nothing defaults from it, because the CORS allow-lists
 * do: a stage's apps are three, and a port written down in one place is a port that
 * cannot be forgotten in the other.
 */
const APP_PORTS = { app: 3000, console: 3002, demo: 3003 } as const;

/**
 * Where mail comes from and where the apps live, when the config says nothing.
 *
 * **The `mail` block is where a stage declares its app origins**, which is a
 * misleading name for it and the reason this comment exists: nothing sends mail
 * from these three values. They are read by `appOrigins` below, and nothing else —
 * the `NEXT_PUBLIC_*` URLs a deployed app needs are the stacks' *outputs*
 * (`ApiUrl`, the pool id), which whoever deploys writes into each app.
 *
 * A default is still better than a refusal, because this file is written by the
 * console *and* edited by hand, and the console's path for a brand-new environment
 * writes only what it has discovered. Defaulting to `localhost` means that file
 * synthesizes and the values a deployed stage actually needs are visible in the
 * file rather than implied by a crash. A stage meant to be reachable sets these.
 */
export function defaultMail(stage: string): MailSettings {
  return {
    fromAddress: 'no-reply@achar.example',
    appBaseUrl: `http://localhost:${APP_PORTS.app}`,
    // The studio is the app at a path, not a process of its own.
    studioBaseUrl: `http://localhost:${APP_PORTS.app}/studio`,
    consoleBaseUrl: `http://localhost:${APP_PORTS.console}`,
  };
}

/**
 * The browser origins this environment's apps are served from.
 *
 * **Every URL is read as its origin, and an origin is scheme, host and port with no
 * path.** A CORS allow-list is compared against the `Origin` header, which never
 * carries a path — so `mail.studioBaseUrl`, which defaults to
 * `http://localhost:3000/studio` because the studio *is* the app at a path, would
 * otherwise sit in the list as an entry that can never match anything. Reducing
 * every URL to its origin is what makes the studio's own default usable.
 *
 * **It reads both places the config says where an app lives, because one is not
 * enough to rely on.** `auth.callbackUrls` has to name a domain for anybody to sign
 * in there, so a domain in that list is a domain a browser will call this API from
 * — and a CORS list that does not include it is a preflight the browser refuses,
 * which surfaces as a CORS error that looks like a network problem rather than like
 * a missing config field. A domain added to one list and forgotten in the other is
 * the failure this function exists to make impossible.
 *
 * The local ports are unconditional. Every app runs on `localhost` before it runs
 * anywhere else, and an API that cannot be called by the studio on the machine the
 * studio is being written on is an API nobody can develop against. There is no
 * 3001: the studio is the app at `/studio` rather than a process of its own, and an
 * origin nothing can be served from looks like it is doing something.
 */
export function appOrigins(config: AcharConfig): string[] {
  const declared = [
    config.mail.appBaseUrl,
    config.mail.studioBaseUrl,
    config.mail.consoleBaseUrl,
    ...config.auth.callbackUrls,
    ...config.auth.logoutUrls,
  ];

  const origins = new Set<string>();
  for (const url of declared) {
    const origin = originOf(url);
    if (origin) origins.add(origin);
  }

  for (const port of Object.values(APP_PORTS)) origins.add(`http://localhost:${port}`);

  return [...origins];
}

/** A URL as its origin, or nothing when it is not one this can read. */
function originOf(url: string): string | undefined {
  try {
    const { origin } = new URL(url);
    // `new URL` answers the *string* `'null'` for a scheme it cannot reduce —
    // `file:`, a bare `mailto:` — and 'null' in a CORS list matches nothing while
    // looking like an entry.
    return origin === 'null' ? undefined : origin;
  } catch {
    return undefined;
  }
}

/**
 * What Cognito has to be told, when the config says nothing.
 *
 * An empty `googleClientId` is the meaningful part: **no Google provider is
 * created at all**, which is a perfectly good pool — people sign up with an email
 * address and a password and everything works. It is also the only possible
 * ordering for a new environment, since registering an OAuth client requires
 * knowing the pool's callback URL and the pool does not exist yet.
 *
 * The callback URLs default to the apps that sign anyone in, `/auth/callback`
 * included. Cognito refuses a client with **no** callback URL, so an empty list is
 * a deploy failure whose message names a property rather than a cause — which is
 * why `validate` insists on a non-empty list even though every other field here
 * has a usable default.
 *
 * Both of Achar's own are listed by the path each app really serves: the studio
 * is a surface of the app under `/studio`, so its callback is
 * `/studio/auth/callback` and a root-level one would be a URL nothing answers.
 */
export function defaultAuth(stage: string): AuthSettings {
  const origins = [
    { origin: `http://localhost:${APP_PORTS.app}`, callbacks: ['/studio/auth/callback'] },
    { origin: `http://localhost:${APP_PORTS.console}`, callbacks: ['/auth/callback'] },
  ];

  return {
    googleClientId: '',
    callbackUrls: origins.flatMap(({ origin, callbacks }) => [
      origin,
      ...callbacks.map((path) => `${origin}${path}`),
    ]),
    logoutUrls: origins.map(({ origin }) => origin),
  };
}

/**
 * The names of the imported resources, for a stack that has decided to import.
 *
 * `loadConfig` has already refused a config that imports something and does not
 * name it, so reaching the throw here means a construct was handed a config that
 * never went through validation — worth a sentence rather than an `undefined` in
 * a bucket ARN.
 */
export function importedResources(config: AcharConfig): ExistingResources {
  if (!config.existing) {
    throw new Error(
      `infra/config/achar-${config.stage}.json has no 'existing' block, but a stack that ` +
        'imports was built from it. Either the config is wrong or the stack ignored ownership.',
    );
  }
  return config.existing;
}

export function loadConfig(stage: string): AcharConfig {
  const file = configPath(stage);

  if (!fs.existsSync(file)) {
    throw new Error(
      [
        `No infrastructure config for stage '${stage}': ${file} is missing.`,
        '',
        'It is written by the console when an environment is saved, and it is how',
        'the stacks learn the account, the region and the physical names of anything',
        'this environment imports:',
        '',
        '  npm run console        # then: Backends → the stage → Checklist',
        '',
        'It can also be read out of an existing deployment:',
        '',
        `  npm run import-state -- --stage=${stage}`,
      ].join('\n'),
    );
  }

  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as AcharConfig;

  // Defaults are applied before validation, never after: a config is checked in
  // the shape the stacks will actually read it in, so "ownership is missing"
  // cannot pass here and become a stack-sized surprise later.
  //
  // `mail` and `auth` are merged field by field rather than replaced wholesale,
  // because a config that names its origins but not its sending address — or the
  // other way round — is a half-filled form rather than a decision to have no
  // origins at all.
  const config: AcharConfig = {
    ...parsed,
    ownership: ownershipOf(parsed),
    mail: { ...defaultMail(parsed.stage), ...parsed.mail },
    auth: { ...defaultAuth(parsed.stage), ...parsed.auth },
    googleClientSecretName: parsed.googleClientSecretName ?? googleClientSecretName(parsed.stage),
  };

  const problems = validate(config);
  if (problems.length > 0) {
    throw new Error(`${file} is incomplete:\n  ${problems.join('\n  ')}`);
  }
  return config;
}

/**
 * The checks that matter, which are the ones whose absence fails late.
 *
 * A missing table name does not fail at synth; it fails as a 500 in the first
 * Lambda that reads that table, after a deploy. A missing distribution domain
 * fails as a broken asset URL. Both are cheap to catch here, against a file that
 * is meant to be read by a person anyway.
 *
 * **What is required depends on what is imported.** A physical name is demanded
 * exactly when `ownership` says the corresponding resource is imported — so an
 * environment that owns its tables is not asked for ten names it does not have,
 * and an environment that imports them cannot leave one out.
 */
function validate(config: AcharConfig): string[] {
  const problems: string[] = [];

  for (const field of ['stage', 'account', 'region'] as const) {
    if (!config[field]) problems.push(`${field} is empty`);
  }

  // The app origins are read by three stacks and by the deploy that writes each
  // app's `.env.local`. An empty one is a CORS rule that allows nothing and an
  // environment variable set to the empty string, neither of which looks like an
  // error until somebody loads a page.
  for (const field of ['appBaseUrl', 'studioBaseUrl', 'consoleBaseUrl'] as const) {
    if (!config.mail?.[field]) problems.push(`mail.${field} is empty`);
  }

  // Cognito rejects a client with no callback URL, and it names the property
  // rather than the cause. An empty list is also what a hand-edit leaves behind
  // when somebody deletes the URLs to "start over".
  if (!config.auth?.callbackUrls?.length) {
    problems.push('auth.callbackUrls is empty, and a Cognito app client must have at least one');
  }

  const ownership = ownershipOf(config);
  const existing = config.existing;

  // A stage either creates its bucket or imports one, and each has its own way of
  // being named. Both at once reads like a decision and behaves like a coin toss,
  // and the loser is a deploy that replaces a bucket full of assets.
  if (!ownership.media && config.assetsBucketName) {
    problems.push(
      'assetsBucketName is set, but ownership.media is false — an imported stage names ' +
        'the bucket it uses in existing.assetsBucket, and this stage creates none',
    );
  }

  // The blocks this environment imports, and the fields each one needs. Keyed by
  // block so the error can name which switch to flip instead of listing names a
  // new environment was never going to have.
  const imported: Record<string, readonly (keyof ExistingResources)[]> = {};
  if (!ownership.tables) imported.tables = [];
  if (!ownership.media) {
    imported.media = ['assetsBucket', 'cloudFrontDistributionId', 'cloudFrontDomain'];
  }
  if (!ownership.auth) {
    imported.auth = ['userPoolId', 'userPoolClientId', 'userPoolDomain'];
  }

  if (Object.keys(imported).length === 0) return problems;

  if (!existing) {
    problems.push(
      `existing is missing, but ownership imports ${Object.keys(imported).join(', ')} — ` +
        'an environment that imports a resource has to name it',
    );
    return problems;
  }

  if (!ownership.tables && Object.keys(existing.tables ?? {}).length === 0) {
    problems.push('existing.tables is empty');
  }
  for (const [block, fields] of Object.entries(imported)) {
    for (const field of fields) {
      if (!existing[field]) problems.push(`existing.${String(field)} is empty (imported ${block})`);
    }
  }

  return problems;
}
