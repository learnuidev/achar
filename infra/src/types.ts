/**
 * The shapes the service table is made of.
 *
 * `src/generated/service.ts` is the backend as data: the tables, their key
 * schemas, the per-table half of the IAM policy, and every function with the
 * routes that reach it. These are the types that table answers to.
 *
 * They are deliberately a *description* of the service rather than CDK objects.
 * It is what the service is, and the stacks decide what to do with it — which is
 * what makes the table the thing to read when a question is about the API's
 * shape (how many routes, which are public, what a table is keyed by) rather
 * than about CloudFormation.
 */

/** One HTTP route. */
export interface HttpRouteSpec {
  /** `projects/{projectId}/members/{userId}` — braces intact, as API Gateway wants. */
  path: string;
  /** Upper-case, always: `GET`, `POST`, `OPTIONS`. */
  method: string;
  /**
   * Whether the Cognito JWT authorizer guards this route.
   *
   * Absent is `true`. Nine routes set it to `false`, and they are two different
   * decisions that happen to share a flag:
   *
   * - **`GET /v1/info`** — so a deployment can be asked whether it is up. One that
   *   cannot is a deployment whose first symptom is a sign-in failure, and this is
   *   the route the console's deploy checklist calls last.
   * - **The eight content routes** (`/v1/data/**` and `/v1/assets/**`) — because
   *   API Gateway's JWT authorizer understands Cognito tokens and nothing else. A
   *   machine presents an Achar API token, which the gateway refuses before any
   *   handler runs, so a JWT-authorised content route would make the whole token
   *   model unreachable. Those handlers authenticate themselves through
   *   `resolveViewer`, accepting either credential.
   *
   * **The consequence is that the handler is the only thing between the dataset and
   * an anonymous caller on those eight routes.** Management routes keep the
   * authorizer, because they are only ever called by a person who is already
   * signed in and verifying at the edge means the handler never sees an
   * unauthenticated request at all.
   */
  authorized?: boolean;
}

/** A DynamoDB key attribute. */
export interface KeyAttribute {
  name: string;
  type: 'S' | 'N' | 'B';
}

/** A key schema entry: the attribute and whether it is the partition key. */
export interface KeySchemaEntry {
  name: string;
  keyType: 'HASH' | 'RANGE';
}

/** A global secondary index. */
export interface SecondaryIndexSpec {
  name: string;
  keySchema: KeySchemaEntry[];
  /** Always `true` here: every read in this API needs the whole row. */
  projectAll: boolean;
}

/**
 * One table.
 *
 * The key schemas are here because they are the one part of this service that
 * cannot be recovered from anywhere else: a table's name is in CloudFormation,
 * but which attribute is its partition key, and which indexes exist over it, is
 * only in this file.
 */
export interface TableSpec {
  /** The logical id — `DocumentsTable` — which is also its CDK construct id. */
  id: string;
  /** The environment variable every handler reads this table's name from. */
  envVar: string;
  billingMode: 'PAY_PER_REQUEST';
  attributeDefinitions: KeyAttribute[];
  keySchema: KeySchemaEntry[];
  globalSecondaryIndexes: SecondaryIndexSpec[];
  /**
   * The actions the shared execution role is granted on this table.
   *
   * One entry per table because each table appears in exactly one statement, so
   * widening one is a decision rather than a side effect of adding a handler.
   */
  actions: string[];
  /**
   * Whether the grant included the table's indexes.
   *
   * Not cosmetic: querying a global secondary index is a `Query` against the
   * *index*, which is a different resource as far as IAM is concerned. A grant
   * without it is a table whose listings work and whose lookups do not.
   */
  grantsIndexes: boolean;
  /**
   * The attribute holding a row's expiry, when the table prunes itself.
   *
   * Only `DeliveriesTable` has one: a delivery record is evidence about a
   * moment, and evidence nobody will look at in a month is storage nobody is
   * paying for on purpose.
   */
  ttlAttribute?: string;
}

/** One Lambda, and everything the gateway and the queues wire to it. */
export interface FunctionSpec {
  /**
   * The key, which is the deployed name's suffix and the searchable string.
   *
   * It matches the handler's file name, so `create-project` is
   * `src/functions/projects/create-project.ts`, and a log line naming the
   * function names the file to open.
   */
  key: string;
  /** Entry point relative to `services/api`: `src/functions/projects/create-project.ts`. */
  entry: string;
  /** The exported symbol in the bundle. `handler` for every function today. */
  handlerExport: string;
  /** Seconds. The service default is 29, which is what an HTTP API will wait. */
  timeout: number;
  memorySize: number;
  description?: string;
  /** Variables this function adds to the shared set — rarely used. */
  environment?: Record<string, string>;
  /**
   * Set when the function is invoked by something other than the gateway.
   *
   * `webhooks/deliver` is the only one: it reads a queue of publish events and
   * calls out to a subscriber's URL, so it has no route and a longer timeout,
   * because a webhook that calls a slow endpoint is one a request handler must
   * not be holding open.
   */
  queue?: boolean;
  http: HttpRouteSpec[];
}
