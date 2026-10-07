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

/** Who mail would come from, and where the four apps live. */
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
  ownership: Ownership;
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

/** The ports the four apps run on, which is what a default has to agree with. */
const APP_PORTS = { app: 3000, studio: 3001, console: 3002 } as const;

/**
 * Where mail comes from and where the apps live, when the config says nothing.
 *
 * **`mail` is not decorative** — it is the only place the app origins are written
 * down, and three things read them, each failing differently when it is missing:
 * the API's CORS allow-list, the asset bucket's CORS rule, and the
 * `NEXT_PUBLIC_*` URLs a deploy writes into each app. A config without it is not a
 * config missing a nicety; it is a deploy that produces an API no browser can
 * call, and a stack that throws a `TypeError` while reading `undefined.appBaseUrl`.
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
    studioBaseUrl: `http://localhost:${APP_PORTS.studio}`,
    consoleBaseUrl: `http://localhost:${APP_PORTS.console}`,
  };
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
 * The callback URLs default to the three apps on their own ports, `/auth/callback`
 * included. Cognito refuses a client with **no** callback URL, so an empty list is
 * a deploy failure whose message names a property rather than a cause — which is
 * why `validate` insists on a non-empty list even though every other field here
 * has a usable default.
 */
export function defaultAuth(stage: string): AuthSettings {
  const origins = [
    `http://localhost:${APP_PORTS.app}`,
    `http://localhost:${APP_PORTS.studio}`,
    `http://localhost:${APP_PORTS.console}`,
  ];

  return {
    googleClientId: '',
    callbackUrls: origins.flatMap((origin) => [origin, `${origin}/auth/callback`]),
    logoutUrls: origins,
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
