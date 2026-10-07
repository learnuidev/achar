import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

import { bundle } from '../bundling.ts';
import type { AcharConfig } from '../config.ts';
import { FUNCTIONS, SERVICE_DEFAULTS, SERVICE_VERSION, TABLES } from '../generated/service.ts';
import { functionName as lambdaName, pascal } from '../naming.ts';
import { grantTables } from './grants.ts';

export interface AcharWebhookStackProps extends StackProps {
  config: AcharConfig;
  /** The tables, by logical id, from the data stack. */
  tables: Record<string, dynamodb.ITable>;
}

/** The two tables a delivery reads and writes, and nothing else. */
const DELIVERY_TABLES = ['WebhooksTable', 'DeliveriesTable'] as const;

/**
 * Telling other people's systems that content changed.
 *
 * A stack of its own, and the split is the same one the rest of this app makes:
 * **what a change to it costs**. A webhook is a URL somebody else owns, and a URL
 * somebody else owns is a request that can hang, time out, or be answered by a
 * server that has been switched off. None of that belongs on the request path of
 * a publish — so publishing *enqueues* and this stack does the calling.
 *
 * That is the whole design, and it is why the queue exists rather than a direct
 * POST from the mutate handler:
 *
 * - A publish returns as soon as the write is durable. The author does not wait
 *   for somebody else's server.
 * - A subscriber that is down is retried rather than lost, and after five
 *   attempts the message goes to a dead-letter queue where it can be looked at
 *   instead of quietly ceasing to exist.
 * - A slow subscriber cannot exhaust a Lambda's concurrency, because the
 *   function that waits is this one and not the one serving requests.
 *
 * The visibility timeout is set to **twice the function's own timeout**, which is
 * not a round number picked for luck: SQS redelivers a message whose visibility
 * has lapsed, so a visibility timeout shorter than the function's would hand the
 * same delivery to a second invocation while the first was still running — two
 * POSTs to a subscriber's endpoint for one publish, which is the failure mode
 * that makes people stop trusting webhooks.
 */
export class AcharWebhookStack extends Stack {
  /** The queue a publish writes to. The API stack sends to it. */
  readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: AcharWebhookStackProps) {
    super(scope, id, props);

    const { config, tables } = props;
    const spec = FUNCTIONS.find((entry) => entry.key === 'deliver-webhook');

    if (!spec) {
      throw new Error(
        'The service table has no deliver-webhook function, so this stack has nothing to ' +
          'deploy. Either the function was renamed or publishing would never be delivered.',
      );
    }

    const deadLetter = new sqs.Queue(this, 'DeliveryDlq', {
      queueName: `achar-${config.stage}-webhook-dead-letter`,
      retentionPeriod: Duration.days(14),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    const queue = new sqs.Queue(this, 'DeliveryQueue', {
      queueName: `achar-${config.stage}-webhook-deliveries`,
      // Twice the function's timeout — see this stack's own note.
      visibilityTimeout: Duration.seconds(spec.timeout * 2),
      // Four days, because a subscriber that is down for a long weekend should
      // still get its events when it comes back.
      retentionPeriod: Duration.days(4),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      deadLetterQueue: { queue: deadLetter, maxReceiveCount: 5 },
    });

    const role = new iam.Role(this, 'DeliveryRole', {
      roleName: `achar-${config.stage}-webhook-delivery`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Reads webhooks, writes delivery records, and calls subscriber URLs',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    grantTables(tables, role, DELIVERY_TABLES);

    const environment: Record<string, string> = {
      STAGE: config.stage,
      REGION: config.region,
      SERVICE_VERSION: SERVICE_VERSION,
    };

    for (const table of TABLES) {
      if (!DELIVERY_TABLES.includes(table.id as (typeof DELIVERY_TABLES)[number])) continue;
      environment[table.envVar] = tables[table.id].tableName;
    }

    const name = lambdaName(config.stage, spec.key);
    const { code, handler } = bundle(spec.entry);

    // An explicit log group rather than `logRetention`, which would create a
    // Lambda-backed custom resource per function. The name is the one Lambda
    // would have chosen anyway, so CloudWatch and the console's Logs tab agree.
    const logGroup = new logs.LogGroup(this, `${pascal(spec.key)}Logs`, {
      logGroupName: `/aws/lambda/${name}`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const delivery = new lambda.Function(this, `${pascal(spec.key)}Function`, {
      functionName: name,
      description: spec.description,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      code,
      handler,
      timeout: Duration.seconds(spec.timeout),
      memorySize: spec.memorySize,
      role,
      environment,
      logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    delivery.addEventSource(
      new SqsEventSource(queue, {
        batchSize: 10,
        // A batch of ten that fails on one message would be retried whole, so the
        // handler reports which records failed and SQS redelivers only those.
        reportBatchItemFailures: true,
        maxBatchingWindow: Duration.seconds(5),
      }),
    );

    this.queue = queue;

    new CfnOutput(this, 'WebhookQueueUrl', {
      value: queue.queueUrl,
      description: 'Where a publish enqueues its deliveries',
    });
    new CfnOutput(this, 'WebhookQueueArn', { value: queue.queueArn });
    new CfnOutput(this, 'WebhookDeadLetterQueueUrl', { value: deadLetter.queueUrl });
  }
}
