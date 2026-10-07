/**
 * The backend, as data.
 *
 * Every Lambda, every route, every table's physical shape and the per-table half
 * of the IAM policy. The stacks in `src/stacks/` read this and turn it into
 * CloudFormation; nothing here knows what CDK is.
 *
 * Two things are worth knowing before reading further:
 *
 * - **The function keys are the deployed names.** `create-project` is
 *   `achar-<stage>-create-project`, which is its log group, its metric and its
 *   CloudFormation logical id (`CreateProjectFunction`). One string, three
 *   places, so a search for it finds all of them.
 * - **`entry` is the file, and it is the only mapping.** `src/functions/projects/create-project.ts`
 *   is bundled to `infra/dist/src/functions/projects/create-project/index.js` by
 *   `scripts/bundle.mjs`, and `src/bundling.ts` derives the asset path and the
 *   handler string from this same value. There is no second list to fall out of
 *   step with the source tree.
 *
 * This file was generated once, from the table it replaced, and is edited by hand
 * from here — which is why the comments carried across are kept where they are
 * attached to the thing they explain. **Adding a route means adding a
 * `FunctionSpec` here and a file at its `entry`.**
 */

import type { FunctionSpec, TableSpec } from '../types.ts';

/** What every function gets unless it says otherwise. */
export const SERVICE_DEFAULTS = {
  runtime: 'nodejs22.x' as const,
  timeout: 29,
  memorySize: 512,
};

/**
 * What the handlers report as their version, and what `GET /v1/info` answers.
 *
 * Written into every function's environment rather than read from `package.json`
 * at request time, because a Lambda's bundle does not carry the repository's
 * `package.json` — and an info endpoint that has to be deployed in order to be
 * asked whether it is current is one nobody asks.
 */
export const SERVICE_VERSION = '1.0.0';

/** How long a webhook delivery is remembered before DynamoDB prunes it. */
export const DELIVERY_TTL_DAYS = 14;

/**
 * The tables.
 *
 * `DocumentsTable` is the one worth reading twice.
 *
 * **`documentKey` is the only key.** It is `{projectId}#{dataset}#{id}`, where
 * `{id}` is the *draft-prefixed* id — so `drafts.post-1` and `post-1` are two
 * rows, which is the whole of the draft/publish model: a draft is not a flag on a
 * document, it is a document.
 *
 * `_rev` is deliberately **not** the sort key. It would have been the obvious
 * choice — it is unique per write and time-ordered — and it would have been
 * wrong: DynamoDB treats a `PutItem` with a new sort key as an *insert*, not an
 * update, so every save would have left the previous revision of the document
 * behind as a row nobody deletes. The revision is a value on the row, not part of
 * its identity.
 *
 * Two indexes, because two questions are asked of a dataset:
 *
 * | Index | Answering |
 * | --- | --- |
 * | `TypeIndex` | the documents of one type, newest first — the studio's list |
 * | `UpdatedIndex` | what changed recently in a dataset — the studio's dashboard, and the candidate set a query is evaluated over |
 *
 * Both hash on a **composed** attribute (`{projectId}#{dataset}#{type}` and
 * `{projectId}#{dataset}`) rather than on two attributes, because a global
 * secondary index has exactly one partition key and one sort key and no more.
 */
export const TABLES: TableSpec[] = [
  {
    id: 'ProjectsTable',
    envVar: 'PROJECTS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [{ name: 'projectId', type: 'S' }],
    keySchema: [{ name: 'projectId', keyType: 'HASH' }],
    globalSecondaryIndexes: [],
    // `BatchGetItem` because "my projects" is a query on the membership index and
    // then one batched read of the projects it named — not a scan.
    actions: [
      'dynamodb:BatchGetItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
  },
  {
    id: 'MembersTable',
    envVar: 'MEMBERS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'projectId', type: 'S' },
      { name: 'memberKey', type: 'S' },
      { name: 'userId', type: 'S' },
      { name: 'invitedEmail', type: 'S' },
    ],
    keySchema: [
      { name: 'projectId', keyType: 'HASH' },
      { name: 'memberKey', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [
      // "Which projects am I in" — one query, newest membership first.
      {
        name: 'UserProjectIndex',
        keySchema: [
          { name: 'userId', keyType: 'HASH' },
          { name: 'projectId', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
      // "What has been offered to me" — queried by the caller's *own* claim's
      // address, so it cannot return an offer addressed to somebody else.
      {
        name: 'InviteEmailIndex',
        keySchema: [
          { name: 'invitedEmail', keyType: 'HASH' },
          { name: 'projectId', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
    ],
    actions: [
      'dynamodb:BatchGetItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: true,
  },
  {
    id: 'DatasetsTable',
    envVar: 'DATASETS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'projectId', type: 'S' },
      { name: 'datasetName', type: 'S' },
    ],
    keySchema: [
      { name: 'projectId', keyType: 'HASH' },
      { name: 'datasetName', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [],
    actions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
  },
  {
    id: 'SchemasTable',
    envVar: 'SCHEMAS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'projectId', type: 'S' },
      { name: 'datasetKey', type: 'S' },
    ],
    keySchema: [
      { name: 'projectId', keyType: 'HASH' },
      { name: 'datasetKey', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [],
    actions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
  },
  {
    id: 'DocumentsTable',
    envVar: 'DOCUMENTS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'documentKey', type: 'S' },
      { name: 'typeKey', type: 'S' },
      { name: 'datasetKey', type: 'S' },
      { name: '_updatedAt', type: 'S' },
    ],
    // No sort key — see this table's own note above.
    keySchema: [{ name: 'documentKey', keyType: 'HASH' }],
    globalSecondaryIndexes: [
      {
        name: 'TypeIndex',
        keySchema: [
          { name: 'typeKey', keyType: 'HASH' },
          { name: '_updatedAt', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
      {
        name: 'UpdatedIndex',
        keySchema: [
          { name: 'datasetKey', keyType: 'HASH' },
          { name: '_updatedAt', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
    ],
    // `BatchWriteItem` because deleting a dataset takes its documents with it in
    // batches of twenty-five, and `BatchGetItem` because an export reads them back
    // the same way.
    actions: [
      'dynamodb:BatchGetItem',
      'dynamodb:BatchWriteItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: true,
  },
  {
    id: 'AssetsTable',
    envVar: 'ASSETS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'projectId', type: 'S' },
      { name: 'assetKey', type: 'S' },
      { name: 'datasetKey', type: 'S' },
      { name: 'createdAt', type: 'S' },
    ],
    keySchema: [
      { name: 'projectId', keyType: 'HASH' },
      { name: 'assetKey', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [
      // The studio's asset library is one query on this index.
      {
        name: 'DatasetCreatedIndex',
        keySchema: [
          { name: 'datasetKey', keyType: 'HASH' },
          { name: 'createdAt', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
    ],
    actions: [
      'dynamodb:BatchWriteItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: true,
  },
  {
    id: 'TokensTable',
    envVar: 'TOKENS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'tokenId', type: 'S' },
      { name: 'projectId', type: 'S' },
      { name: 'createdAt', type: 'S' },
    ],
    // Keyed by the token's own id rather than by project, because the lookup that
    // matters is the one every authenticated request makes: given a token id,
    // find its hash. Listing a project's tokens is the rarer question, and it is
    // what the index is for.
    keySchema: [{ name: 'tokenId', keyType: 'HASH' }],
    globalSecondaryIndexes: [
      {
        name: 'ProjectIndex',
        keySchema: [
          { name: 'projectId', keyType: 'HASH' },
          { name: 'createdAt', keyType: 'RANGE' },
        ],
        projectAll: true,
      },
    ],
    actions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: true,
  },
  {
    id: 'WebhooksTable',
    envVar: 'WEBHOOKS_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'projectId', type: 'S' },
      { name: 'webhookId', type: 'S' },
    ],
    keySchema: [
      { name: 'projectId', keyType: 'HASH' },
      { name: 'webhookId', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [],
    actions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
  },
  {
    id: 'DeliveriesTable',
    envVar: 'DELIVERIES_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [
      { name: 'webhookId', type: 'S' },
      { name: 'deliveryId', type: 'S' },
    ],
    keySchema: [
      { name: 'webhookId', keyType: 'HASH' },
      { name: 'deliveryId', keyType: 'RANGE' },
    ],
    globalSecondaryIndexes: [],
    actions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
    ttlAttribute: 'expiresAt',
  },
  {
    id: 'ProfilesTable',
    envVar: 'PROFILES_TABLE',
    billingMode: 'PAY_PER_REQUEST',
    attributeDefinitions: [{ name: 'userId', type: 'S' }],
    keySchema: [{ name: 'userId', keyType: 'HASH' }],
    globalSecondaryIndexes: [],
    actions: [
      'dynamodb:BatchGetItem',
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
    ],
    grantsIndexes: false,
  },
];

/**
 * The functions, in the order the groups appear in the API.
 *
 * One route each, and the pairing is the point: a handler that serves two routes
 * would have to branch on the path, which is a handler whose authorization
 * depends on which branch it took. `GET /v1/info` is the only route in the
 * service that carries no authorizer, and the reason is written where it is
 * declared.
 */
export const FUNCTIONS: FunctionSpec[] = [
  {
    key: 'info',
    entry: 'src/functions/info.ts',
    handlerExport: 'handler',
    timeout: 10,
    memorySize: 256,
    description: 'What this deployment is, answered without a token.',
    http: [{ path: '/v1/info', method: 'GET', authorized: false }],
  },

  // ── the caller ─────────────────────────────────────────────────────────────
  {
    key: 'get-profile',
    entry: 'src/functions/me/get-profile.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The caller, and how many projects and invitations they have.',
    http: [{ path: '/v1/me', method: 'GET' }],
  },
  {
    key: 'list-invitations',
    entry: 'src/functions/me/list-invitations.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Invitations addressed to the caller’s own address.',
    http: [{ path: '/v1/me/invitations', method: 'GET' }],
  },

  // ── projects ───────────────────────────────────────────────────────────────
  {
    key: 'create-project',
    entry: 'src/functions/projects/create-project.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Create a project; the caller becomes its admin.',
    http: [{ path: '/v1/projects', method: 'POST' }],
  },
  {
    key: 'list-projects',
    entry: 'src/functions/projects/list-projects.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The projects the caller is an active member of.',
    http: [{ path: '/v1/projects', method: 'GET' }],
  },
  {
    key: 'get-project',
    entry: 'src/functions/projects/get-project.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'One project, with the caller’s own role on it.',
    http: [{ path: '/v1/projects/{projectId}', method: 'GET' }],
  },
  {
    key: 'update-project',
    entry: 'src/functions/projects/update-project.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Rename a project, or rewrite what it says about itself.',
    http: [{ path: '/v1/projects/{projectId}', method: 'PATCH' }],
  },
  {
    key: 'delete-project',
    entry: 'src/functions/projects/delete-project.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 1024,
    description: 'Delete a project, and everything that belongs to it.',
    http: [{ path: '/v1/projects/{projectId}', method: 'DELETE' }],
  },

  // ── members ────────────────────────────────────────────────────────────────
  {
    key: 'list-members',
    entry: 'src/functions/members/list-members.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The roster: members and unaccepted invitations.',
    http: [{ path: '/v1/projects/{projectId}/members', method: 'GET' }],
  },
  {
    key: 'invite-member',
    entry: 'src/functions/members/invite-member.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Invite an address with a role.',
    http: [{ path: '/v1/projects/{projectId}/members', method: 'POST' }],
  },
  {
    key: 'update-member',
    entry: 'src/functions/members/update-member.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Change a member’s role.',
    http: [{ path: '/v1/projects/{projectId}/members/{userId}', method: 'PATCH' }],
  },
  {
    key: 'remove-member',
    entry: 'src/functions/members/remove-member.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Remove a member, or revoke an unaccepted invitation.',
    http: [{ path: '/v1/projects/{projectId}/members/{userId}', method: 'DELETE' }],
  },
  {
    key: 'resend-invitation',
    entry: 'src/functions/members/resend-invitation.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Send an invitation again, optionally correcting its role.',
    http: [{ path: '/v1/projects/{projectId}/members/{userId}/invitation', method: 'POST' }],
  },
  {
    key: 'accept-invitation',
    entry: 'src/functions/members/accept-invitation.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Accept the invitation addressed to the caller’s own address.',
    http: [{ path: '/v1/projects/{projectId}/invitation', method: 'POST' }],
  },

  // ── datasets and schema ────────────────────────────────────────────────────
  {
    key: 'list-datasets',
    entry: 'src/functions/datasets/list-datasets.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The project’s datasets.',
    http: [{ path: '/v1/projects/{projectId}/datasets', method: 'GET' }],
  },
  {
    key: 'create-dataset',
    entry: 'src/functions/datasets/create-dataset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Make a dataset, with the default content model.',
    http: [{ path: '/v1/projects/{projectId}/datasets', method: 'POST' }],
  },
  {
    key: 'get-dataset',
    entry: 'src/functions/datasets/get-dataset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'One dataset.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}', method: 'GET' }],
  },
  {
    key: 'update-dataset',
    entry: 'src/functions/datasets/update-dataset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Change a dataset’s visibility.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}', method: 'PATCH' }],
  },
  {
    key: 'delete-dataset',
    entry: 'src/functions/datasets/delete-dataset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 1024,
    description: 'Delete a dataset and everything in it.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}', method: 'DELETE' }],
  },
  {
    key: 'export-dataset',
    entry: 'src/functions/datasets/export-dataset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 1024,
    description: 'The whole dataset, portable.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}/export', method: 'GET' }],
  },
  {
    key: 'get-schema',
    entry: 'src/functions/schema/get-schema.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The schema a dataset is authored against.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}/schema', method: 'GET' }],
  },
  {
    key: 'put-schema',
    entry: 'src/functions/schema/put-schema.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Replace the schema a dataset is authored against.',
    http: [{ path: '/v1/projects/{projectId}/datasets/{dataset}/schema', method: 'PUT' }],
  },

  // ── tokens ─────────────────────────────────────────────────────────────────
  {
    key: 'list-tokens',
    entry: 'src/functions/tokens/list-tokens.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The project’s API tokens, without their secrets.',
    http: [{ path: '/v1/projects/{projectId}/tokens', method: 'GET' }],
  },
  {
    key: 'create-token',
    entry: 'src/functions/tokens/create-token.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Issue an API token. The only response that carries the secret.',
    http: [{ path: '/v1/projects/{projectId}/tokens', method: 'POST' }],
  },
  {
    key: 'revoke-token',
    entry: 'src/functions/tokens/revoke-token.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Revoke an API token.',
    http: [{ path: '/v1/projects/{projectId}/tokens/{tokenId}', method: 'DELETE' }],
  },

  // ── webhooks ───────────────────────────────────────────────────────────────
  {
    key: 'list-webhooks',
    entry: 'src/functions/webhooks/list-webhooks.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'The project’s webhooks, with their last delivery.',
    http: [{ path: '/v1/projects/{projectId}/webhooks', method: 'GET' }],
  },
  {
    key: 'create-webhook',
    entry: 'src/functions/webhooks/create-webhook.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Make a webhook.',
    http: [{ path: '/v1/projects/{projectId}/webhooks', method: 'POST' }],
  },
  {
    key: 'update-webhook',
    entry: 'src/functions/webhooks/update-webhook.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Change a webhook, or take it out of service.',
    http: [{ path: '/v1/projects/{projectId}/webhooks/{webhookId}', method: 'PATCH' }],
  },
  {
    key: 'delete-webhook',
    entry: 'src/functions/webhooks/delete-webhook.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Delete a webhook.',
    http: [{ path: '/v1/projects/{projectId}/webhooks/{webhookId}', method: 'DELETE' }],
  },
  {
    key: 'list-deliveries',
    entry: 'src/functions/webhooks/list-deliveries.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'What a webhook has been told, and what happened.',
    http: [{ path: '/v1/projects/{projectId}/webhooks/{webhookId}/deliveries', method: 'GET' }],
  },
  {
    key: 'deliver-webhook',
    entry: 'src/functions/webhooks/deliver.ts',
    handlerExport: 'handler',
    // No route, and a timeout of its own: this one calls *out*, and a subscriber
    // whose endpoint takes twenty seconds must not be holding an HTTP response
    // open — which is the whole reason publishing enqueues rather than posts.
    timeout: 60,
    memorySize: 512,
    queue: true,
    description: 'Sign and POST a content event to a subscriber, and record what happened.',
    http: [],
  },

  // ── the content API ────────────────────────────────────────────────────────
  {
    key: 'query-documents',
    entry: 'src/functions/data/query.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 1024,
    description: 'Run a GROQ query against one dataset.',
    http: [{ path: '/v1/data/query/{projectId}/{dataset}', method: 'GET' }],
  },
  {
    key: 'list-documents',
    entry: 'src/functions/data/list-documents.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Documents of one type, paged, for a studio’s list.',
    http: [{ path: '/v1/data/list/{projectId}/{dataset}', method: 'GET' }],
  },
  {
    key: 'get-document',
    entry: 'src/functions/data/get-document.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'One document, at one perspective.',
    http: [{ path: '/v1/data/doc/{projectId}/{dataset}/{documentId}', method: 'GET' }],
  },
  {
    key: 'mutate-documents',
    entry: 'src/functions/data/mutate.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 1024,
    description: 'Apply an ordered batch of mutations, and enqueue what changed.',
    http: [{ path: '/v1/data/mutate/{projectId}/{dataset}', method: 'POST' }],
  },

  // ── assets ─────────────────────────────────────────────────────────────────
  {
    key: 'list-assets',
    entry: 'src/functions/assets/list-assets.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'A dataset’s asset library.',
    http: [{ path: '/v1/assets/{projectId}/{dataset}', method: 'GET' }],
  },
  {
    key: 'create-asset-upload-url',
    entry: 'src/functions/assets/create-upload-url.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Reserve an asset row and presign a PUT for the bytes.',
    http: [{ path: '/v1/assets/{projectId}/{dataset}/upload-url', method: 'POST' }],
  },
  {
    key: 'commit-asset',
    entry: 'src/functions/assets/commit-asset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Record an asset’s metadata once its bytes have landed.',
    http: [{ path: '/v1/assets/{projectId}/{dataset}', method: 'POST' }],
  },
  {
    key: 'delete-asset',
    entry: 'src/functions/assets/delete-asset.ts',
    handlerExport: 'handler',
    timeout: 29,
    memorySize: 512,
    description: 'Delete an asset’s object and its row.',
    http: [{ path: '/v1/assets/{projectId}/{dataset}/{assetId}', method: 'DELETE' }],
  },
];

/**
 * The stacks, in the order they have to deploy.
 *
 * Exported because two things need the same list and neither can import the other
 * cheaply: `bin/achar.ts` builds them, and the console's plan checks that every
 * one of them is settled and carries its outputs. A stack added here and not to
 * the console is a stack an environment would be reported complete without.
 */
export const STACK_NAMES = [
  'Data',
  'Media',
  'Auth',
  'Webhook',
  'Api',
] as const;

export type StackGroup = (typeof STACK_NAMES)[number];

/** `AcharApiStack-dev`. */
export function stackName(group: StackGroup, stage: string): string {
  return `Achar${group}Stack-${stage}`;
}
