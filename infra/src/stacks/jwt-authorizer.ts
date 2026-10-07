import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import type { Construct } from 'constructs';

export interface JwtRouteAuthorizerProps {
  /** The API the authorizer belongs to. An authorizer is a child of one API. */
  httpApi: apigwv2.IHttpApi;
  /** The token issuer: a Cognito pool's URL, or any OIDC provider's. */
  issuer: string;
  /** The `aud` a token must carry. The app client ids that may call this API. */
  audience: string[];
  identitySource?: string[];
}

/**
 * A JWT route authorizer, assembled from the pieces `aws-cdk-lib` actually ships.
 *
 * `HttpJwtAuthorizer` and `HttpUserPoolAuthorizer` live in the
 * `@aws-cdk/aws-apigatewayv2-authorizers-alpha` package rather than in
 * `aws-cdk-lib`, and taking an alpha dependency for one class means pinning a
 * second version that has to move in step with the first. The stable library has
 * everything needed underneath — `HttpAuthorizer` with `type: JWT`, an issuer and
 * an audience — it just does not have the `IHttpRouteAuthorizer` wrapper that
 * `addRoutes` wants. This is that wrapper, and it is twenty lines.
 *
 * It is a class implementing an interface rather than a factory function because
 * `addRoutes` binds one authorizer to many routes, and a bind must be able to
 * happen more than once — which a closure returning a config object could not do
 * without recreating the authorizer per route.
 *
 * APIGateway's own vocabulary matters here: `authorizationType` is `'JWT'`, and
 * `'NONE'` is a different value that means *no* authorizer. A route that asks for
 * no authorizer passes `undefined` rather than a `HttpNoneAuthorizer`, because
 * `undefined` leaves the route without an authorizer at all instead of attaching
 * one that always allows.
 */
export class JwtRouteAuthorizer implements apigwv2.IHttpRouteAuthorizer {
  private readonly authorizer: apigwv2.HttpAuthorizer;

  constructor(scope: Construct, id: string, props: JwtRouteAuthorizerProps) {
    this.authorizer = new apigwv2.HttpAuthorizer(scope, id, {
      authorizerName: id,
      httpApi: props.httpApi,
      type: apigwv2.HttpAuthorizerType.JWT,
      identitySource: props.identitySource ?? ['$request.header.Authorization'],
      jwtIssuer: props.issuer,
      jwtAudience: props.audience,
    });
  }

  bind(_options: apigwv2.HttpRouteAuthorizerBindOptions): apigwv2.HttpRouteAuthorizerConfig {
    return {
      authorizationType: 'JWT',
      authorizerId: this.authorizer.authorizerId,
      // No scopes: this API authorizes by *who* the token is for, and every scope
      // it could demand would be a scope every app client would then have to
      // request. A route that needs finer authorization asks the handlers, which
      // is where the role model already lives.
    };
  }
}
