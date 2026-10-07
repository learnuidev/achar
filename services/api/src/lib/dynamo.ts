/**
 * The DynamoDB edge.
 *
 * One document client, built on first use, and a small vocabulary of operations
 * over it. Every one of them takes a logical table id (`'ProjectsTable'`) rather
 * than a physical table name, so a stack rename is one edit in `env.ts` and no
 * handler ever holds a table name it could get wrong.
 *
 * **A query against a GSI is a different IAM resource.** `dynamodb:Query` on a
 * table does not grant it on that table's indexes — the index has its own ARN —
 * so the infra grants each index explicitly. Nothing here can check that, which
 * is exactly why it is written down: a route that starts using `IdIndex` and
 * answers 500 in a deployed environment is a missing grant, not a missing row.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { AttributeValue, TransactWriteItem } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { env } from './env';
import { HttpError } from './http';

/**
 * Built lazily, and that is not an optimization.
 *
 * The client is constructed on first use rather than at module load so that a
 * handler which touches no table — `GET /v1/info` — is not the one that fails
 * when the SDK cannot pick up a region.
 */
let cached: DynamoDBDocumentClient | undefined;

export function db(): DynamoDBDocumentClient {
  cached ??= DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    // A field left `undefined` in a handler is absent from the item rather than
    // an error at the client boundary, which is what makes `...(x ? {x} : {})`
    // optional in every writer above this one.
    marshallOptions: { removeUndefinedValues: true },
  });
  return cached;
}

export const TABLE_IDS = [
  'ProjectsTable',
  'MembersTable',
  'DatasetsTable',
  'SchemasTable',
  'DocumentsTable',
  'AssetsTable',
  'TokensTable',
  'WebhooksTable',
  'DeliveriesTable',
  'ProfilesTable',
] as const;

export type TableId = (typeof TABLE_IDS)[number];

const TABLE_NAMES: Record<TableId, () => string> = {
  ProjectsTable: () => env.projectsTable,
  MembersTable: () => env.membersTable,
  DatasetsTable: () => env.datasetsTable,
  SchemasTable: () => env.schemasTable,
  DocumentsTable: () => env.documentsTable,
  AssetsTable: () => env.assetsTable,
  TokensTable: () => env.tokensTable,
  WebhooksTable: () => env.webhooksTable,
  DeliveriesTable: () => env.deliveriesTable,
  ProfilesTable: () => env.profilesTable,
};

export function tableName(id: TableId): string {
  return TABLE_NAMES[id]();
}

export type Key = Record<string, unknown>;
export type Item = Record<string, unknown>;

/**
 * Every key shape in one place.
 *
 * A key built at a call site is a key that can be built differently at the next
 * one, and the composite ones — a `documentKey` packing three ids into a string,
 * a `datasetKey` packing two — are the ones where that goes wrong quietly.
 */
export const Keys = {
  project: (projectId: string): Key => ({ projectId }),
  member: (projectId: string, memberKey: string): Key => ({ projectId, memberKey }),
  dataset: (projectId: string, datasetName: string): Key => ({ projectId, datasetName }),
  schema: (projectId: string, datasetKey: string): Key => ({ projectId, datasetKey }),
  /**
   * `DocumentsTable` is keyed by `documentKey` alone.
   *
   * `_rev` is a value on the row rather than part of its identity, and that is
   * what makes a save an update of one row: a revision inside the key would make
   * every write an insert, leaving the previous revision behind and the table
   * holding every version of every document.
   */
  document: (documentKey: string): Key => ({ documentKey }),
  asset: (projectId: string, assetKey: string): Key => ({ projectId, assetKey }),
  token: (tokenId: string): Key => ({ tokenId }),
  webhook: (projectId: string, webhookId: string): Key => ({ projectId, webhookId }),
  delivery: (webhookId: string, deliveryId: string): Key => ({ webhookId, deliveryId }),
  profile: (userId: string): Key => ({ userId }),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Single-item operations
// ─────────────────────────────────────────────────────────────────────────────

export async function getItem<T>(table: TableId, key: Key): Promise<T | undefined> {
  const result = await db().send(new GetCommand({ TableName: tableName(table), Key: key }));
  return result.Item as T | undefined;
}

export interface WriteConditions {
  /** A DynamoDB condition expression. `#names` are resolved from `names`. */
  condition?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
}

export async function putItem(table: TableId, item: Item, conditions: WriteConditions = {}): Promise<void> {
  await db().send(
    new PutCommand({
      TableName: tableName(table),
      Item: item,
      ...(conditions.condition ? { ConditionExpression: conditions.condition } : {}),
      ...(conditions.names ? { ExpressionAttributeNames: conditions.names } : {}),
      ...(conditions.values ? { ExpressionAttributeValues: conditions.values } : {}),
    }),
  );
}

/**
 * Writes an item only if one is not already there.
 *
 * `false` means something is — which is a 409 to a create route and a no-op to a
 * `createIfNotExists`, so the decision stays with the caller rather than being
 * baked into a helper that guesses.
 */
export async function putIfAbsent(table: TableId, item: Item, keyAttribute: string): Promise<boolean> {
  try {
    await putItem(table, item, {
      condition: 'attribute_not_exists(#key)',
      names: { '#key': keyAttribute },
    });
    return true;
  } catch (error) {
    if (isConditionalCheckFailed(error)) return false;
    throw error;
  }
}

export interface RemoveResult {
  /** False when the condition was not met, or the row was already gone. */
  deleted: boolean;
}

/**
 * Deletes an item, reporting whether anything was there.
 *
 * A failed condition is not an error: a cascade that walks a list of children
 * and finds one already removed has done its job, and a conditional delete is
 * how a counter is told that this attempt was the one that changed something.
 */
export async function deleteItem(
  table: TableId,
  key: Key,
  conditions: WriteConditions = {},
): Promise<RemoveResult> {
  try {
    const result = await db().send(
      new DeleteCommand({
        TableName: tableName(table),
        Key: key,
        ReturnValues: 'ALL_OLD',
        ...(conditions.condition ? { ConditionExpression: conditions.condition } : {}),
        ...(conditions.names ? { ExpressionAttributeNames: conditions.names } : {}),
        ...(conditions.values ? { ExpressionAttributeValues: conditions.values } : {}),
      }),
    );
    return { deleted: result.Attributes !== undefined };
  } catch (error) {
    if (isConditionalCheckFailed(error)) return { deleted: false };
    throw error;
  }
}

export interface UpdateSpec {
  set?: Record<string, unknown>;
  setIfMissing?: Record<string, unknown>;
  remove?: string[];
  /** Atomic increments. A missing attribute counts as zero, which is why a
   *  counter never needs to be initialized before it is first moved. */
  inc?: Record<string, number>;
  condition?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
  returnValues?: 'ALL_NEW' | 'ALL_OLD' | 'NONE';
}

/**
 * Applies an update, and throws when its condition is not met.
 *
 * The path handling is the part worth reading: a key of `set` is an attribute
 * *path* — `primaryCta.label` — and each segment is aliased, because DynamoDB
 * would otherwise read the dots as navigation and because a field named `order`
 * or `size` is a reserved word. A path segment has to be a plain name: an array
 * index in a patch would need a different expression, and silently accepting one
 * here would write the wrong field.
 */
export async function updateItem<T = Item>(
  table: TableId,
  key: Key,
  spec: UpdateSpec,
): Promise<T | undefined> {
  const names: Record<string, string> = { ...spec.names };
  const values: Record<string, unknown> = { ...spec.values };
  const clauses: string[] = [];
  const removals: string[] = [];
  let nameCount = 0;
  let valueCount = 0;

  const path = (attribute: string): string => {
    const segments = attribute.split('.');
    return segments
      .map((segment) => {
        if (!/^[A-Za-z0-9_]+$/.test(segment)) {
          throw new HttpError(400, 'BAD_REQUEST', `Cannot address the field ${attribute}`, {
            field: attribute,
          });
        }
        nameCount += 1;
        const alias = `#p${nameCount}`;
        names[alias] = segment;
        return alias;
      })
      .join('.');
  };

  const value = (input: unknown): string => {
    valueCount += 1;
    const alias = `:v${valueCount}`;
    values[alias] = input;
    return alias;
  };

  for (const [attribute, entry] of Object.entries(spec.set ?? {})) {
    clauses.push(`${path(attribute)} = ${value(entry)}`);
  }

  for (const [attribute, entry] of Object.entries(spec.setIfMissing ?? {})) {
    const alias = value(entry);
    clauses.push(`${path(attribute)} = if_not_exists(${path(attribute)}, ${alias})`);
  }

  for (const [attribute, amount] of Object.entries(spec.inc ?? {})) {
    clauses.push(`${path(attribute)} ${amount < 0 ? '-' : '+'} ${value(amount)}`);
  }

  for (const attribute of spec.remove ?? []) {
    removals.push(path(attribute));
  }

  const updateExpression = buildUpdateExpression(clauses, removals);
  if (!updateExpression) {
    throw new HttpError(400, 'BAD_REQUEST', 'Nothing to update');
  }

  const result = await db().send(
    new UpdateCommand({
      TableName: tableName(table),
      Key: key,
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ...(spec.condition ? { ConditionExpression: spec.condition } : {}),
      ...(spec.returnValues ? { ReturnValues: spec.returnValues } : {}),
    }),
  );

  return result.Attributes as T | undefined;
}

function buildUpdateExpression(clauses: string[], removals: string[]): string {
  const parts: string[] = [];
  if (clauses.length > 0) parts.push(`SET ${clauses.join(', ')}`);
  if (removals.length > 0) parts.push(`REMOVE ${removals.join(', ')}`);
  return parts.join(' ');
}

/**
 * The same update, where a failed condition is an answer rather than an error.
 *
 * `false` is "it was already so" — the second half of every idempotent write in
 * this API: revoking a token twice, accepting an invitation twice, committing an
 * asset that was already committed.
 */
export async function tryUpdateItem<T = Item>(
  table: TableId,
  key: Key,
  spec: UpdateSpec,
): Promise<{ changed: boolean; item?: T }> {
  try {
    const item = await updateItem<T>(table, key, spec);
    return { changed: true, ...(item ? { item } : {}) };
  } catch (error) {
    if (isConditionalCheckFailed(error)) return { changed: false };
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────────────

export interface QuerySpec {
  index?: string;
  keyCondition: string;
  filter?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
  limit?: number;
  /** Ascending by sort key unless this is false, which is how "newest first" is asked for. */
  scanIndexForward?: boolean;
  exclusiveStartKey?: Key;
}

export interface QueryPage<T> {
  items: T[];
  lastEvaluatedKey?: Key;
}

export async function query<T>(table: TableId, spec: QuerySpec): Promise<QueryPage<T>> {
  const result = await db().send(
    new QueryCommand({
      TableName: tableName(table),
      ...(spec.index ? { IndexName: spec.index } : {}),
      KeyConditionExpression: spec.keyCondition,
      ...(spec.filter ? { FilterExpression: spec.filter } : {}),
      ...(spec.names ? { ExpressionAttributeNames: spec.names } : {}),
      ...(spec.values ? { ExpressionAttributeValues: spec.values } : {}),
      ...(spec.limit ? { Limit: spec.limit } : {}),
      ...(spec.scanIndexForward === undefined ? {} : { ScanIndexForward: spec.scanIndexForward }),
      ...(spec.exclusiveStartKey ? { ExclusiveStartKey: spec.exclusiveStartKey } : {}),
    }),
  );

  return {
    items: (result.Items ?? []) as T[],
    ...(result.LastEvaluatedKey ? { lastEvaluatedKey: result.LastEvaluatedKey } : {}),
  };
}

/** How many items the caller asks to read before this gives up entirely. */
const QUERY_ALL_CEILING = 5000;

/**
 * Every page of a query, up to a ceiling.
 *
 * The ceiling is the point of the function as much as the loop is: cascades walk
 * this, and a cascade with no bound is a delete that runs until the Lambda times
 * out and leaves the table half-emptied. `QUERY_ALL_CEILING` is larger than any
 * dataset this API is built for, and reaching it is a deployment that should be
 * paging with `nextToken` rather than deleting in one request.
 */
export async function queryAll<T>(table: TableId, spec: QuerySpec): Promise<T[]> {
  const items: T[] = [];
  let startKey = spec.exclusiveStartKey;

  for (;;) {
    const page = await query<T>(table, { ...spec, ...(startKey ? { exclusiveStartKey: startKey } : {}) });
    items.push(...page.items);

    if (!page.lastEvaluatedKey || items.length >= QUERY_ALL_CEILING) return items;
    startKey = page.lastEvaluatedKey;
  }
}

/** The count a query matches, without reading the items — used for `Profile`. */
export async function countQuery(table: TableId, spec: QuerySpec): Promise<number> {
  const result = await db().send(
    new QueryCommand({
      TableName: tableName(table),
      ...(spec.index ? { IndexName: spec.index } : {}),
      KeyConditionExpression: spec.keyCondition,
      ...(spec.filter ? { FilterExpression: spec.filter } : {}),
      ...(spec.names ? { ExpressionAttributeNames: spec.names } : {}),
      ...(spec.values ? { ExpressionAttributeValues: spec.values } : {}),
      Select: 'COUNT',
    }),
  );
  return result.Count ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

/** The transaction item limit DynamoDB enforces. */
export const TRANSACT_ITEM_LIMIT = 100;

/**
 * Runs a transaction, refusing one DynamoDB would refuse anyway.
 *
 * Checking the limit here is not the same as checking it in each caller: a batch
 * of mutations that is one item over the limit is a request that has already
 * been read and authorized, and the error a client sees should say what was
 * wrong with it rather than what DynamoDB called it.
 */
/**
 * The two transaction actions this API builds.
 *
 * They exist because of a type mismatch that is nobody's mistake: the document
 * client marshals `Record<string, unknown>` on the way out, but a transaction is
 * typed against raw `AttributeValue`s, so the cast has to happen somewhere. It
 * happens here, once, rather than at each of the four call sites.
 */
export function putAction(table: TableId, item: Item, conditions: WriteConditions = {}): TransactWriteItem {
  return {
    Put: {
      TableName: tableName(table),
      Item: item as unknown as Record<string, AttributeValue>,
      ...(conditions.condition ? { ConditionExpression: conditions.condition } : {}),
      ...(conditions.names ? { ExpressionAttributeNames: conditions.names } : {}),
      ...(conditions.values
        ? { ExpressionAttributeValues: conditions.values as Record<string, AttributeValue> }
        : {}),
    },
  };
}

export function deleteAction(table: TableId, key: Key, conditions: WriteConditions = {}): TransactWriteItem {
  return {
    Delete: {
      TableName: tableName(table),
      Key: key as unknown as Record<string, AttributeValue>,
      ...(conditions.condition ? { ConditionExpression: conditions.condition } : {}),
      ...(conditions.names ? { ExpressionAttributeNames: conditions.names } : {}),
      ...(conditions.values
        ? { ExpressionAttributeValues: conditions.values as Record<string, AttributeValue> }
        : {}),
    },
  };
}

export interface TransactOptions {
  /**
   * DynamoDB's idempotency token, so a retried call cannot apply the same
   * transaction twice — a Lambda that timed out after the write landed but
   * before it answered would otherwise be free to publish the same document
   * again on its next invocation.
   */
  clientRequestToken?: string;
}

export async function transactWrite(
  items: TransactWriteItem[],
  options: TransactOptions = {},
): Promise<void> {
  if (items.length === 0) return;
  if (items.length > TRANSACT_ITEM_LIMIT) {
    throw new HttpError(
      400,
      'TOO_MANY_WRITES',
      `A transaction may carry at most ${TRANSACT_ITEM_LIMIT} items`,
      { count: items.length },
    );
  }
  await db().send(
    new TransactWriteCommand({
      TransactItems: items,
      ...(options.clientRequestToken
        ? { ClientRequestToken: options.clientRequestToken.slice(0, 36) }
        : {}),
    }),
  );
}

export function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === 'ConditionalCheckFailedException';
}

export function isTransactionCanceled(error: unknown): boolean {
  return error instanceof Error && error.name === 'TransactionCanceledException';
}

/**
 * Which items of a cancelled transaction failed their condition.
 *
 * DynamoDB answers a transaction with one reason per item, in order, and all of
 * them are `None` except the one that stopped it. Returning the indexes lets a
 * caller name the document that collided rather than reporting the whole batch
 * as a failure with no subject.
 */
export function cancelledIndexes(error: unknown): number[] {
  if (!isTransactionCanceled(error)) return [];
  const reasons = (error as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? [];
  return reasons
    .map((reason, index) => (reason.Code && reason.Code !== 'None' ? index : -1))
    .filter((index) => index >= 0);
}
