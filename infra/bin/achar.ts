#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';

import { loadConfig } from '../src/config.ts';
import { AcharApiStack } from '../src/stacks/api-stack.ts';
import { AcharAuthStack } from '../src/stacks/auth-stack.ts';
import { AcharDataStack } from '../src/stacks/data-stack.ts';
import { AcharMediaStack } from '../src/stacks/media-stack.ts';
import { AcharWebhookStack } from '../src/stacks/webhook-stack.ts';

/**
 * The Achar backend, as five stacks.
 *
 * They are split by **what a change to one of them costs**, not by size:
 *
 * | Stack | Holds | Deploy frequency |
 * | --- | --- | --- |
 * | `AcharDataStack` | The tables | Rarely |
 * | `AcharMediaStack` | The assets bucket and the content CDN | Rarely |
 * | `AcharAuthStack` | The user pool, its app client and its Hosted UI domain | Occasionally |
 * | `AcharWebhookStack` | The delivery queue, and the function that empties it | Occasionally |
 * | `AcharApiStack` | The handlers, their routes, and the IAM | Constantly |
 *
 * CloudFormation caps a stack at 500 resources, and the ceiling is real: this API
 * has thirty-nine functions, each with a log group, a role attachment and an
 * integration, plus ten tables with fourteen indexes between them. The split is
 * what assigns that ceiling — adding a route touches one stack, and that stack has
 * room.
 *
 * ## What each stack does with its stateful resources is `ownership`
 *
 * The first three stacks each hold one of the three stateful groups — the tables,
 * the media and the pool — and `ownership` in `infra/config/achar-<stage>.json`
 * decides, per group, whether the stack creates it or imports it:
 *
 * - **A new environment** sets all three `true` and imports nothing. Deploying it
 *   creates its own tables, bucket, distribution and pool, named `achar-<stage>-*`
 *   and empty. This is what the deploy console writes for a stage that has never
 *   existed, so it is what almost every environment is.
 * - **A stage that already existed** sets all three `false`. Every resource is
 *   imported by physical name and is therefore *unmanaged*: CloudFormation will
 *   not change it and will not delete it. `cdk deploy --all` is then close to a
 *   no-op for everything but `AcharApiStack`, and if it is not, something is wrong.
 *
 * The two stacks that own no stateful group are the other half of that rule.
 * `AcharWebhookStack` creates its queue on every stage, because a queue is not
 * data — and losing one costs a few events rather than a few years of content.
 *
 * The stage is a context value, so one app describes every deployment:
 *
 *   cdk deploy --all --context stage=dev
 *   cdk synth --all --context stage=staging
 */

const app = new App();

const stage = app.node.tryGetContext('stage') ?? process.env.STAGE ?? 'dev';
const config = loadConfig(stage);

// Explicit account and region, never environment-derived.
//
// This is not tidiness. An imported table's ARN is built from the stack's account
// and region, and if those are unresolved tokens the ARN becomes a token too —
// which turns every cross-stack reference into a CloudFormation export/import,
// and makes a synth that once worked fail the first time two stacks have to agree.
// Literal values keep the templates plain strings.
const env = { account: config.account, region: config.region };

const data = new AcharDataStack(app, `AcharDataStack-${stage}`, {
  env,
  config,
  description: 'Achar data: the DynamoDB tables — created, or imported from an existing deployment',
});

const media = new AcharMediaStack(app, `AcharMediaStack-${stage}`, {
  env,
  config,
  description: 'Achar media: the assets bucket and the CloudFront CDN that serves it',
});

const auth = new AcharAuthStack(app, `AcharAuthStack-${stage}`, {
  env,
  config,
  description: 'Achar auth: the Cognito user pool, its app client and its Hosted UI domain',
});

/**
 * What the webhook stack needs: the two tables a delivery reads and writes.
 *
 * Handed the whole map rather than the two entries, because `grants.ts` is what
 * decides which of them a function may touch — so the narrowing lives in one
 * place instead of being split between here and there.
 */
const webhook = new AcharWebhookStack(app, `AcharWebhookStack-${stage}`, {
  env,
  config,
  description: 'Achar webhooks: the delivery queue and the function that calls subscriber URLs',
  tables: data.tables,
});

new AcharApiStack(app, `AcharApiStack-${stage}`, {
  env,
  config,
  description: 'Achar API: the functions, their routes, and the IAM that reaches the data',
  tables: data.tables,
  media: {
    assetsBucket: media.assetsBucket,
    distributionDomain: media.distribution.distributionDomainName,
  },
  auth: {
    userPool: auth.userPool,
    userPoolClientId: auth.userPoolClientId,
  },
  webhookQueue: webhook.queue,
});

// Tags so a resource in the console says which deployment it belongs to. Not on
// the imported ones — an unmanaged resource is not tagged from here, and a tag
// that only sometimes applies is worse than none.
Tags.of(app).add('Project', 'achar');
Tags.of(app).add('Stage', stage);
Tags.of(app).add('ManagedBy', 'cdk');
