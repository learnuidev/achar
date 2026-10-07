import type {
  AuthUrlsWriteView,
  EnvironmentSettings,
  EnvironmentSettingsInput,
  GoogleOAuthValues,
  SettingsWriteView,
} from "@/lib/types";
import { awsJson, getIdentity } from "./aws";
import {
  configFile,
  configProblems,
  consoleDefaults,
  googleClientSecretName,
  hostedUiHost,
  listStages,
  newStageConfig,
  ownershipOf,
  pickSeedStage,
  readConfig,
  stageOutputs,
  writeConfig,
  type StageConfig,
} from "./environments";

export { googleClientSecretName };

/**
 * What a person supplies, as opposed to what a deploy discovers.
 *
 * ## There is one input here, and it is the one nobody can derive
 *
 * A new environment creates its own user pool, and a pool is built with a Google
 * identity provider — which needs a client id, a client secret and a list of
 * callback URLs. There is nowhere to look those up: they are issued by the Google
 * Cloud console, for a project that is not this repository. So they are the
 * content of a **screen** rather than of a config field somebody edits by hand:
 * Backends → the environment → Checklist.
 *
 * ## Three destinations, kept apart on purpose
 *
 * - the **configuration** goes into the committed config file;
 * - the **URL lists** go onto the pool that is running now, because a deploy is
 *   not the only thing that decides which redirects Cognito accepts;
 * - the **secret** goes to Secrets Manager and is never read back.
 *
 * ## The secret never touches the repository
 *
 * Write-only in both directions: sent to Secrets Manager on save, never read
 * back, and the page shows only whether one is stored. That is not fastidiousness
 * — the config file is committed, and a credential in it would be a credential in
 * the history of every clone.
 *
 * Secrets Manager rather than SSM because CloudFormation refuses an SSM Secure
 * reference in `AWS::Cognito::UserPoolIdentityProvider`; `infra/src/config.ts`
 * has the error message and the reasoning. The name is **per stage**, so two
 * environments cannot overwrite each other's credential.
 */

const EMPTY_MAIL = {
  fromAddress: "",
  appBaseUrl: "",
  studioBaseUrl: "",
  consoleBaseUrl: "",
};

/**
 * The settings on disk, with the defaults an absent block would have.
 *
 * **A stage with no config file gets a draft rather than null.** That is the state
 * a new environment is in before anything has been written, and it is exactly
 * when somebody has to supply the Google client id and secret: the pool this
 * environment will create is built from them. So the draft is the *seed's* values
 * — the product's mail addresses, its client id, its callback URLs — under this
 * stage's name, and the console shows it as a form with one thing missing, which
 * is the credential only a person has.
 *
 * Nothing about the seed's *data* is in it: not a table name, not a bucket, not a
 * pool. `hasConfig: false` is what tells the page it is looking at a draft.
 *
 * Null still means "nothing to say": no file here, and no other stage's file
 * complete enough to borrow the product settings from.
 */
export function readSettings(stage: string): EnvironmentSettings | null {
  const config = readConfig(stage);
  const seedStage = config ? null : pickSeedStage(stage);
  const source = config ?? (seedStage ? readConfig(seedStage) : null);
  if (!source) return null;

  const draft = config === null;
  const ownership = draft ? { tables: true, media: true, auth: true } : ownershipOf(config);

  return {
    stage,
    configPath: configFile(stage),
    hasConfig: !draft,
    seededFrom: draft ? seedStage : null,
    account: source.account ?? null,
    region: source.region ?? null,
    ownership,
    // A draft is a *new environment*: it creates the tables, the media and the
    // pool, so it needs a secret for the provider its pool is built with. An
    // imported pool already has its provider attached and a deploy never reads
    // the secret.
    needsGoogleSecret: draft ? true : ownership.auth,
    googleClientSecretName: googleClientSecretName(stage),
    googleClientSecretSet: false,
    auth: {
      googleClientId: source.auth?.googleClientId ?? "",
      callbackUrls: source.auth?.callbackUrls ?? [],
      logoutUrls: source.auth?.logoutUrls ?? [],
    },
    mail: {
      fromAddress: source.mail?.fromAddress ?? EMPTY_MAIL.fromAddress,
      appBaseUrl: source.mail?.appBaseUrl ?? EMPTY_MAIL.appBaseUrl,
      studioBaseUrl: source.mail?.studioBaseUrl ?? EMPTY_MAIL.studioBaseUrl,
      consoleBaseUrl: source.mail?.consoleBaseUrl ?? EMPTY_MAIL.consoleBaseUrl,
    },
    // Filled in by the route, which is where the auth stack gets read.
    oauth: { cognitoDomain: null, javaScriptOrigin: null, redirectUri: null },
  };
}

/** Whether a Secrets Manager secret with this name exists and has a value. */
export async function googleSecretStatus(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<boolean> {
  return secretStored(googleClientSecretName(stage), ctx);
}

/**
 * Whether a secret exists and was given a value.
 *
 * `describe-secret` answers with the ARN but not the value, which is exactly what
 * is wanted: this is about whether a credential is *there*, and the console has
 * no reason to read one.
 */
async function secretStored(
  name: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<boolean> {
  const found = await awsJson<{ ARN: string }>(
    ["secretsmanager", "describe-secret", "--secret-id", name],
    { ...ctx, optional: true },
  ).catch(() => null);
  return Boolean(found?.ARN);
}

/**
 * The values Google has to be told, or Google refuses every sign-in.
 *
 * A federated sign-in is a conversation between three parties, and this is the
 * half of it that lives in the Google Cloud console rather than here: Google will
 * not send anybody to a Cognito domain it has not been told about, and the failure
 * is `redirect_uri_mismatch` — a Google-branded error page that names neither this
 * repository nor this file.
 *
 * - **Authorized JavaScript origins** — the Hosted UI's origin.
 * - **Authorized redirect URIs** — Cognito's own callback, `/oauth2/idpresponse`,
 *   which is where Google returns to and Cognito then maps onto the app's
 *   `callbackUrls`. These are two different lists and both have to be right: these
 *   say where Google may send a person, `callbackUrls` says where Cognito may send
 *   one afterwards.
 *
 * ## The output is a prefix, not a hostname
 *
 * `AcharAuthStack`'s `UserPoolDomain` is the **domain prefix** —
 * `achar-<stage>-<account>` — because that is what Cognito is given at creation
 * and what the stack's own `GoogleCallbackUrl` is built from. Turning it into the
 * hostname Google has to be told about is `hostedUiHost`, in `environments.ts`,
 * and it is shared with the frontend's `.env.local` rather than written twice:
 * the app is handed the same hostname, and the one time the two drifted, the app
 * was handed the prefix and the browser could not resolve it. The assembled
 * callback is used when the stack published one: a name that appeared in both
 * places would otherwise be a second answer to "which URL does Google call".
 *
 * Before the first deploy there is no stack, so the prefix is derived the way the
 * auth stack will build it, from the account the deploy is about to use — which is
 * the one thing the console has to be handed while the file is still a draft.
 */
export async function googleOAuthValues(
  stage: string,
  ctx: { profile?: string; region?: string } = {},
  account?: string | null,
): Promise<GoogleOAuthValues> {
  const config = readConfig(stage);
  const outputs = await stageOutputs(stage, ctx).catch(() => null);

  const region = config?.region ?? ctx.region ?? consoleDefaults().region;
  const owner = config?.account ?? account ?? null;
  // `stageOutputs` already hands back a hostname, and the two fallbacks are a
  // prefix — `hostedUiHost` takes either, which is what lets this read the same
  // as the environment card and the frontend's `.env.local`.
  const host = hostedUiHost(
    outputs?.cognitoDomain ??
      config?.existing?.userPoolDomain ??
      (owner ? `achar-${stage}-${owner}` : null),
    region,
  );

  if (!host) return { cognitoDomain: null, javaScriptOrigin: null, redirectUri: null };

  return {
    cognitoDomain: host,
    javaScriptOrigin: `https://${host}`,
    // Cognito's fixed path for an identity provider's response, and the stack's
    // own output when there is one. Not configurable, and spelled exactly like
    // this on both sides.
    redirectUri: outputs?.googleCallbackUrl ?? `https://${host}/oauth2/idpresponse`,
  };
}

/**
 * Writes the settings for an environment.
 *
 * Three destinations, deliberately kept apart:
 *
 * - the **configuration** goes into the committed config file. When there is no
 *   file yet, this creates one — a *new environment*, `ownership` all `true` and
 *   no `existing` block — which is what makes this form the way an environment is
 *   created rather than something to fill in afterwards;
 * - the **URLs Cognito will accept** go onto the pool that is running now, by the
 *   call `applyAuthUrls` makes;
 * - the **secret** goes to Secrets Manager, write-only in both directions.
 *
 * Nothing else in an existing file is touched — it is read, two blocks are
 * replaced, and it is written back — so a field this view does not know about
 * survives a save.
 */
export async function saveSettings(
  stage: string,
  input: EnvironmentSettingsInput,
  ctx: { profile?: string; region?: string } = {},
): Promise<{ settings: EnvironmentSettings; write: SettingsWriteView }> {
  const before = readConfig(stage);
  const seedStage = before ? null : pickSeedStage(stage);
  const seed = seedStage ? readConfig(seedStage) : null;

  const auth = {
    googleClientId: input.auth.googleClientId.trim(),
    callbackUrls: clean(input.auth.callbackUrls),
    logoutUrls: clean(input.auth.logoutUrls),
  };
  const mail = {
    fromAddress: input.mail.fromAddress.trim(),
    appBaseUrl: input.mail.appBaseUrl.trim(),
    studioBaseUrl: input.mail.studioBaseUrl.trim(),
    consoleBaseUrl: input.mail.consoleBaseUrl.trim(),
  };

  const problems = validate({ auth, mail, secret: input.googleClientSecret });
  if (problems.length > 0) throw new Error(problems.join("\n"));

  const created = before === null;
  let file: string;
  if (before) {
    file = writeConfig({ ...before, auth, mail });
  } else {
    // The account the console is acting as, not the seed's: the file has to name
    // the account the deploy will actually use, and the two are compared in the
    // plan's second step.
    const identity = await getIdentity({ profile: ctx.profile, region: ctx.region }).catch(
      () => null,
    );
    file = writeConfig(
      newStageConfig(stage, seed, {
        account: identity?.account ?? seed?.account ?? null,
        region: ctx.region ?? seed?.region ?? null,
        auth,
        mail,
      }),
    );
  }

  if (input.googleClientSecret) {
    await writeSecret(
      googleClientSecretName(stage),
      input.googleClientSecret,
      `Google OAuth client secret for the ${stage} environment`,
      ctx,
    );
  }

  const settings = readSettings(stage);
  if (!settings) throw new Error(`Wrote ${file}, but it could not be read back.`);
  settings.googleClientSecretSet = await googleSecretStatus(stage, ctx);
  settings.oauth = await googleOAuthValues(stage, ctx, settings.account);

  return {
    settings,
    write: {
      configPath: file,
      created,
      secretWritten: Boolean(input.googleClientSecret),
      authUrls: await authUrlsNote(stage, auth, ctx),
    },
  };
}

/**
 * Create a secret, or replace its value.
 *
 * `create-secret` and `put-secret-value` rather than `put-secret-value` alone,
 * because the first save for an environment has nothing to put to. Not
 * `update-secret`, which is for metadata and would leave a fresh secret with no
 * value at all — and a secret with no value is one CloudFormation resolves to an
 * empty string, which the provider then rejects at the first sign-in rather than
 * at the deploy.
 */
async function writeSecret(
  name: string,
  value: string,
  description: string,
  ctx: { profile?: string; region?: string },
): Promise<void> {
  const exists = await secretStored(name, ctx);

  const argv = exists
    ? ["secretsmanager", "put-secret-value", "--secret-id", name, "--secret-string", value]
    : [
        "secretsmanager",
        "create-secret",
        "--name",
        name,
        "--description",
        description,
        "--secret-string",
        value,
      ];

  await awsJson(argv, ctx);
}

/* ------------------------------------------------------------------ *
 * The live app client
 * ------------------------------------------------------------------ */

/**
 * Applying the saved callback and logout URLs to the pool that is running now.
 *
 * ## Why a save has to reach Cognito at all
 *
 * The config file is what a *deploy* reads, and for a stage that creates its own
 * pool that is enough: `auth-stack.ts` builds the app client from
 * `auth.callbackUrls` on every deploy. It is not enough in two cases, and they are
 * the two this saves a person from:
 *
 * - a stage that **imports** its pool — an imported resource is unmanaged, so
 *   nothing a deploy does can change the URL lists Cognito accepts;
 * - a stage whose pool is **already up**, where waiting for a deploy to accept a
 *   URL somebody just added is a deploy run for a field.
 *
 * So the save writes the client directly. The symptom of not doing it is
 * `redirect_uri_mismatch`: a Google-branded error page that names neither this
 * repository nor the field that was filled in.
 *
 * ## Why the client is read first
 *
 * `UpdateUserPoolClient` **replaces every setting it is not given** — it is not a
 * patch. Calling it with only two URL lists would clear the client's auth flows,
 * its scopes, its token lifetimes and its identity providers, and the failure
 * would arrive as "sign-in stopped working" some time later. So the client is read,
 * its own values are carried across, and only the two lists are replaced.
 *
 * ## A failure is a sentence, not a failed save
 *
 * The config file has been written by the time this runs, and for a stage whose
 * pool does not exist yet there is nothing to write to and nothing wrong. That is
 * reported in `SettingsWriteView.authUrls` rather than thrown: the save is what the
 * request asked for, and this is the half of it that has its own outcome.
 */
async function authUrlsNote(
  stage: string,
  auth: { callbackUrls: string[]; logoutUrls: string[] },
  ctx: { profile?: string; region?: string },
): Promise<AuthUrlsWriteView> {
  try {
    return await applyAuthUrls(stage, auth, ctx);
  } catch (error) {
    return {
      applied: false,
      note: error instanceof Error ? error.message : String(error),
    };
  }
}

interface UserPoolClientResponse {
  UserPoolClient?: Record<string, unknown> & {
    ClientId?: string;
    CallbackURLs?: string[];
    LogoutURLs?: string[];
  };
}

/**
 * The fields of a client that survive an update.
 *
 * Listed rather than inferred from the response, because the response carries
 * read-only fields too — `CreationDate`, `LastModifiedDate` — and passing one of
 * those to `update-user-pool-client` is a parameter validation error that names
 * the field and not the reason. The ones here are the ones that decide how a
 * sign-in behaves.
 */
const CLIENT_SETTINGS = [
  "ClientName",
  "RefreshTokenValidity",
  "AccessTokenValidity",
  "IdTokenValidity",
  "TokenValidityUnits",
  "ReadAttributes",
  "WriteAttributes",
  "ExplicitAuthFlows",
  "SupportedIdentityProviders",
  "AllowedOAuthFlows",
  "AllowedOAuthScopes",
  "AllowedOAuthFlowsUserPoolClient",
  "PreventUserExistenceErrors",
  "EnableTokenRevocation",
  "EnablePropagateAdditionalUserContextData",
  "AuthSessionValidity",
] as const;

export interface AuthUrlLists {
  callbackUrls: string[];
  logoutUrls: string[];
}

export async function applyAuthUrls(
  stage: string,
  urls: AuthUrlLists,
  ctx: { profile?: string; region?: string },
): Promise<AuthUrlsWriteView> {
  // Both lists are written in one call, so one empty list is not a smaller
  // change — it is a request to leave a client that cannot complete a sign-in,
  // since every redirect is checked against this list. Left alone, and said so.
  if (urls.callbackUrls.length === 0 || urls.logoutUrls.length === 0) {
    return {
      applied: false,
      note:
        "Cognito was left as it is: both lists are written at once, and one of them " +
        "was saved empty.",
    };
  }

  const config = readConfig(stage);
  const outputs = await stageOutputs(stage, ctx).catch(() => null);
  const poolId = config?.existing?.userPoolId ?? outputs?.userPoolId ?? null;
  const clientId = config?.existing?.userPoolClientId ?? outputs?.userPoolClientId ?? null;

  if (!poolId || !clientId) {
    return {
      applied: false,
      note:
        `No pool to write to yet — ${stage} has not been deployed, or imports one this ` +
        "console cannot name. The config file is saved, and the app client is built " +
        "from it when the auth stack deploys.",
    };
  }

  const current = await awsJson<UserPoolClientResponse>(
    ["cognito-idp", "describe-user-pool-client", "--user-pool-id", poolId, "--client-id", clientId],
    { ...ctx, optional: true },
  ).catch(() => null);

  const client = current?.UserPoolClient;
  if (!client) {
    return {
      applied: false,
      note: `The app client ${clientId} could not be read in ${poolId}, so Cognito was left as it is.`,
    };
  }

  const args = [
    "cognito-idp",
    "update-user-pool-client",
    "--user-pool-id",
    poolId,
    "--client-id",
    clientId,
    "--callback-urls",
    ...urls.callbackUrls,
    "--logout-urls",
    ...urls.logoutUrls,
  ];

  // A `DefaultRedirectURI` is only valid while it is one of the callbacks, and
  // Cognito rejects the whole call when it is not — so it travels with the list
  // rather than being carried over blindly.
  const previousDefault = client.DefaultRedirectURI;
  if (typeof previousDefault === "string" && urls.callbackUrls.includes(previousDefault)) {
    args.push("--default-redirect-uri", previousDefault);
  }

  for (const key of CLIENT_SETTINGS) {
    const value = client[key];
    if (value === undefined || value === null) continue;
    const flag = `--${kebab(key)}`;
    if (typeof value === "boolean") {
      // The CLI spells a false boolean as `--no-<flag>`; passing `--flag false`
      // is rejected as an unexpected positional.
      args.push(value ? flag : `--no-${kebab(key)}`);
    } else if (Array.isArray(value)) {
      if (value.length > 0) args.push(flag, ...value.map((item) => String(item)));
    } else if (typeof value === "object") {
      args.push(flag, JSON.stringify(value));
    } else {
      args.push(flag, String(value));
    }
  }

  await awsJson(args, ctx);

  return {
    applied: true,
    note: `${count(urls.callbackUrls.length, "callback")} and ${count(
      urls.logoutUrls.length,
      "logout",
    )} now live on the app client — no redeploy needed`,
  };
}

/** `AllowedOAuthFlowsUserPoolClient` → `allowed-o-auth-flows-user-pool-client`. */
function kebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

function count(n: number, noun: string): string {
  return `${n} ${noun} URL${n === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * The checks worth making before any of this reaches AWS.
 *
 * Each one is a value that is *accepted* by the config file and then fails much
 * later and much less clearly: a malformed callback URL is rejected by Cognito
 * during a rollback of the auth stack, and a client id without a secret is a
 * provider that cannot complete a sign-in. Reported together rather than one at a
 * time, because a form with three fields wrong should take one trip.
 */
function validate(input: {
  auth: { googleClientId: string; callbackUrls: string[]; logoutUrls: string[] };
  mail: {
    fromAddress: string;
    appBaseUrl: string;
    studioBaseUrl: string;
    consoleBaseUrl: string;
  };
  secret?: string;
}): string[] {
  const problems: string[] = [];
  const { auth, mail, secret } = input;

  if (auth.googleClientId && !auth.googleClientId.endsWith(".apps.googleusercontent.com")) {
    problems.push(
      `"${auth.googleClientId}" does not look like a Google OAuth client id — they end in .apps.googleusercontent.com.`,
    );
  }
  if (secret && !auth.googleClientId) {
    problems.push("A Google client secret needs a client id to go with it.");
  }

  for (const [label, urls] of [
    ["Callback", auth.callbackUrls],
    ["Logout", auth.logoutUrls],
  ] as const) {
    for (const url of urls) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        problems.push(`${label} URL "${url}" is not a valid URL.`);
        continue;
      }
      // Cognito accepts http for localhost and requires https everywhere else.
      const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
      if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) {
        problems.push(`${label} URL "${url}" must be https, or http on localhost.`);
      }
    }
  }

  for (const [label, url] of [
    ["App", mail.appBaseUrl],
    ["Studio", mail.studioBaseUrl],
    ["Console", mail.consoleBaseUrl],
  ] as const) {
    if (url && !/^https?:\/\//.test(url)) {
      problems.push(`${label} base URL "${url}" has to start with http:// or https://.`);
    }
  }

  if (mail.fromAddress && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail.fromAddress)) {
    problems.push(`"${mail.fromAddress}" is not a valid email address.`);
  }

  return problems;
}

/** Trim, drop blanks, and drop duplicates — a URL list is a set to Cognito. */
function clean(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * The stages the checklist can offer a draft from.
 *
 * `listStages` plus `configProblems` is the whole of it: the seed has to be a
 * stage whose file is complete, because a half-written file is not product
 * settings to borrow but a mistake to fix.
 */
export function seedCandidates(stage: string): string[] {
  return listStages().filter((candidate) => {
    if (candidate === stage) return false;
    const config = readConfig(candidate);
    return config !== null && configProblems(config).length === 0;
  });
}

/** The environment the checklist form is drawn against. */
export function settingsContext(): { profile: string; region: string } {
  const { profile, region } = consoleDefaults();
  return { profile, region };
}

/** The config a draft was drawn from, for the one place that needs the document. */
export function seedConfig(stage: string): StageConfig | null {
  const seed = pickSeedStage(stage);
  return seed ? readConfig(seed) : null;
}
