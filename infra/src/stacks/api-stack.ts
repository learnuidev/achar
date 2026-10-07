import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

import { bundle } from '../bundling.ts';
import type { AcharConfig } from '../config.ts';
import { FUNCTIONS, SERVICE_DEFAULTS, SERVICE_VERSION, TABLES } from '../generated/service.ts';
import { functionName as lambdaName, pascal, routePath } from '../naming.ts';
import type { HttpRouteSpec } from '../types.ts';
import { grantTables } from './grants.ts';
import { JwtRouteAuthorizer } from './jwt-authorizer.ts';

export interface AcharApiStackProps extends StackProps {
  config: AcharConfig;
  /** The tables, by logical id, from the data stack. */
  tables: Record<string, dynamodb.ITable>;
  /** What the asset handlers need to presign an upload and build a URL. */
  media: {
    assetsBucket: s3.IBucket;
    distributionDomain: string;
  };
  /** The pool whose tokens the authorizer trusts, and whose ids the handlers read. */
  auth: {
    userPool: cognito.IUserPool;
    userPoolClientId: string;
  };
  /** Where a publish enqueues its webhook deliveries. */
  webhookQueue: sqs.IQueue;
}

/**
 * The handlers, their routes, and the IAM that reaches the data.
 *
 * This is the stack that deploys constantly, which is why it holds nothing
 * stateful at all: everything a deploy could break by replacing lives in the
 * three stacks before it, and this one is functions and routes.
 *
 * ## One role, deliberately
 *
 * Every function here runs as the same role, and that role is the union of what
 * the service needs. The alternative — a role per function, each with the two
 * tables its own handler touches — is more precise and was rejected for a reason
 * that is about people rather than security: a handler's reach is not knowable
 * from its name. `list-members` resolves a membership, then a project, then a
 * batch of profiles, and an authorizer that had to be told that would be a policy
 * edited every time somebody adds a field to a response. One role with the
 * service's real reach is a policy that can be read and audited; forty narrow
 * ones that are wrong in subtle ways are not.
 *
 * `FunctionSpec.ownRole` exists in the service table for the day that stops being
 * true — a function that needs a permission no other function should have.
 *
 * ## HTTP API, and why the handlers add their own CORS header
 *
 * API Gateway **HTTP APIs** apply a CORS configuration to *preflight* requests
 * only. A REST API would add the headers to the actual response too
 * (`GatewayResponses`), and that is the one thing the older product does better —
 * so the handlers set `Access-Control-Allow-Origin` themselves, in one place, in
 * `services/api/src/lib/http.ts`. The preflight is still API Gateway's, because a
 * preflight that reached a Lambda would be a Lambda invoked for a request no user
 * made.
 */
export class AcharApiStack extends Stack {
  /** The API's own endpoint. What the four apps put in `NEXT_PUBLIC_ACHAR_API_URL`. */
  readonly apiEndpoint: string;

  constructor(scope: Construct, id: string, props: AcharApiStackProps) {
    super(scope, id, props);

    const { config, tables, media, auth, webhookQueue } = props;

    const role = new iam.Role(this, 'ApiRole', {
      roleName: `achar-${config.stage}-api`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Every handler in the Achar API',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    grantTables(tables, role);

    // Read and write, not read: an upload is a presigned PUT signed *with this
    // role's* credentials, so the permission has to exist here even though the
    // bytes never pass through a Lambda. Deleting an asset is the write the
    // handlers do themselves.
    media.assetsBucket.grantReadWrite(role);
    webhookQueue.grantSendMessages(role);

    const environment: Record<string, string> = {
      STAGE: config.stage,
      REGION: config.region,
      SERVICE_VERSION,
      ASSETS_BUCKET: media.assetsBucket.bucketName,
      ASSETS_CDN_DOMAIN: media.distributionDomain,
      USER_POOL_ID: auth.userPool.userPoolId,
      USER_POOL_CLIENT_ID: auth.userPoolClientId,
      WEBHOOK_QUEUE_URL: webhookQueue.queueUrl,
    };

    for (const table of TABLES) {
      environment[table.envVar] = tables[table.id].tableName;
    }

    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `achar-${config.stage}`,
      description: 'The Achar content API',
      corsPreflight: {
        allowOrigins: appOrigins(config),
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        // `authorization` is the one that matters: every route but `/v1/info`
        // needs a bearer token, and a preflight that does not allow the header
        // makes the real request unreachable from a browser.
        allowHeaders: ['authorization', 'content-type'],
        exposeHeaders: ['x-achar-request-id'],
        maxAge: Duration.hours(1),
      },
    });

    // The authorizer is built after the API because an authorizer is a child of
    // one API, and before the routes because `addRoutes` binds it to them.
    const authorizer = new JwtRouteAuthorizer(this, 'CognitoAuthorizer', {
      httpApi: api,
      issuer: `https://cognito-idp.${config.region}.amazonaws.com/${auth.userPool.userPoolId}`,
      audience: [auth.userPoolClientId],
    });

    const created: string[] = [];

    for (const spec of FUNCTIONS) {
      // A queue consumer has no route, and a Lambda with no route and no event
      // source is a function nobody can reach — it belongs to the stack that
      // owns its queue.
      if (spec.queue) continue;

      const name = lambdaName(config.stage, spec.key);
      const { code, handler } = bundle(spec.entry);

      const logGroup = new logs.LogGroup(this, `${pascal(spec.key)}Logs`, {
        logGroupName: `/aws/lambda/${name}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        // Destroyed with the stack rather than retained: a log group that outlives
        // its function is the first thing that stops a redeploy of the same name.
        removalPolicy: RemovalPolicy.DESTROY,
      });

      const fn = new lambda.Function(this, `${pascal(spec.key)}Function`, {
        functionName: name,
        description: spec.description,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        code,
        handler,
        timeout: Duration.seconds(spec.timeout),
        memorySize: spec.memorySize,
        role,
        environment: { ...environment, ...spec.environment },
        logGroup,
        tracing: lambda.Tracing.ACTIVE,
      });

      const integration = new integrations.HttpLambdaIntegration(
        `${pascal(spec.key)}Integration`,
        fn,
      );

      for (const route of spec.http) {
        api.addRoutes({
          path: routePath(route.path),
          methods: [methodOf(route)],
          integration,
          authorizer: isAuthorized(route) ? authorizer : undefined,
        });
        created.push(`${route.method} ${route.path}`);
      }
    }

    this.apiEndpoint = api.apiEndpoint;

    new CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
      description: 'What the apps put in NEXT_PUBLIC_ACHAR_API_URL',
    });
    new CfnOutput(this, 'ApiId', {
      value: api.apiId,
      description: 'The API Gateway HTTP API id, for the console and the CLI',
    });
    new CfnOutput(this, 'RouteCount', {
      value: String(created.length),
      description: 'How many routes this deployment answers',
    });
  }
}

/** Every method an HTTP API can route, keyed by how a route names it. */
const METHODS: Record<string, apigwv2.HttpMethod> = {
  GET: apigwv2.HttpMethod.GET,
  POST: apigwv2.HttpMethod.POST,
  PUT: apigwv2.HttpMethod.PUT,
  PATCH: apigwv2.HttpMethod.PATCH,
  DELETE: apigwv2.HttpMethod.DELETE,
  HEAD: apigwv2.HttpMethod.HEAD,
  OPTIONS: apigwv2.HttpMethod.OPTIONS,
  ANY: apigwv2.HttpMethod.ANY,
};

function methodOf(route: HttpRouteSpec): apigwv2.HttpMethod {
  const method = METHODS[route.method.toUpperCase()];

  if (!method) {
    throw new Error(
      `Route ${route.method} ${route.path} names a method API Gateway does not route. ` +
        'The service table is the list of what this API answers, so a typo in it is a ' +
        'route that would never have been created.',
    );
  }

  return method;
}

/** Absent means guarded — only `GET /v1/info` opts out. */
function isAuthorized(route: HttpRouteSpec): boolean {
  return route.authorized !== false;
}

/**
 * The origins a browser may call this API from.
 *
 * Read from the config's own app URLs rather than hard-coded, because a stage
 * whose site lives somewhere else has a stage-specific CORS problem, and the local
 * ports are included unconditionally: every one of the four apps runs on
 * `localhost` before it runs anywhere else, and an API that cannot be called by the
 * studio on the machine the studio is being written on is an API nobody can
 * develop against.
 */
function appOrigins(config: AcharConfig): string[] {
  const origins = new Set([
    config.mail.appBaseUrl,
    config.mail.studioBaseUrl,
    config.mail.consoleBaseUrl,
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ]);

  return [...origins].filter(Boolean);
}
