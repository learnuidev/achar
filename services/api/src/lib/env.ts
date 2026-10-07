/**
 * Every environment variable a handler may read, in one place.
 *
 * The reads are getters rather than an object built once at module load, and
 * that is deliberate: a module-level read turns every variable into a cold
 * start's problem, so a handler that never touches `ASSETS_BUCKET` would fail
 * because the media stack is not deployed in this environment. A getter throws
 * at the moment it is used and names the variable, which is where a missing
 * configuration value is still legible — three frames later it is an `undefined`
 * that some other code has already turned into a confusing error of its own.
 *
 * The infra supplies all of these; nothing here has a default, because a
 * default is how a deployment quietly talks to the wrong table.
 */

function read(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface AcharEnv {
  readonly stage: string;
  readonly region: string;
  readonly version: string;

  readonly projectsTable: string;
  readonly membersTable: string;
  readonly datasetsTable: string;
  readonly schemasTable: string;
  readonly documentsTable: string;
  readonly assetsTable: string;
  readonly tokensTable: string;
  readonly webhooksTable: string;
  readonly deliveriesTable: string;
  readonly profilesTable: string;

  readonly assetsBucket: string;
  readonly assetsCdnDomain: string;

  readonly userPoolId: string;
  readonly userPoolClientId: string;

  /** The queue the publish webhooks are delivered through. */
  readonly webhookQueueUrl: string;
}

export const env: AcharEnv = {
  get stage() {
    return read('STAGE');
  },
  get region() {
    return read('REGION');
  },
  get version() {
    return read('SERVICE_VERSION');
  },

  get projectsTable() {
    return read('PROJECTS_TABLE');
  },
  get membersTable() {
    return read('MEMBERS_TABLE');
  },
  get datasetsTable() {
    return read('DATASETS_TABLE');
  },
  get schemasTable() {
    return read('SCHEMAS_TABLE');
  },
  get documentsTable() {
    return read('DOCUMENTS_TABLE');
  },
  get assetsTable() {
    return read('ASSETS_TABLE');
  },
  get tokensTable() {
    return read('TOKENS_TABLE');
  },
  get webhooksTable() {
    return read('WEBHOOKS_TABLE');
  },
  get deliveriesTable() {
    return read('DELIVERIES_TABLE');
  },
  get profilesTable() {
    return read('PROFILES_TABLE');
  },

  get assetsBucket() {
    return read('ASSETS_BUCKET');
  },
  get assetsCdnDomain() {
    return read('ASSETS_CDN_DOMAIN');
  },

  get userPoolId() {
    return read('USER_POOL_ID');
  },
  get userPoolClientId() {
    return read('USER_POOL_CLIENT_ID');
  },

  get webhookQueueUrl() {
    return read('WEBHOOK_QUEUE_URL');
  },
};
