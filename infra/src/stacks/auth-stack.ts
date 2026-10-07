import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack } from 'aws-cdk-lib';
import type { StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type { Construct } from 'constructs';

import type { AcharConfig } from '../config.ts';
import { importedResources, ownershipOf } from '../config.ts';

export interface AcharAuthStackProps extends StackProps {
  config: AcharConfig;
}

/**
 * Who is allowed in: the user pool, its app client, and the Hosted UI domain.
 *
 * The pool is the one resource here that is about **people** rather than content.
 * Deleting it deletes every account in it and a redeploy of the same name makes a
 * new, empty one — which is why it is `RemovalPolicy.RETAIN` and why the console
 * treats deleting it as a separate, explicitly-ticked step rather than something
 * that happens because a stack went away.
 *
 * ## The app client is public
 *
 * `generateSecret` is false, deliberately: the studio and the console are
 * browser applications, and a client secret shipped to a browser is not a secret
 * — it is a string in a bundle anybody can read. The client is protected by the
 * PKCE authorization-code flow and by its callback URLs instead, which is the
 * shape every public OAuth client has.
 *
 * ## Google is optional on purpose
 *
 * A pool with no Google provider is a perfectly good pool: people sign up with an
 * email address and a password and everything works. The provider is created only
 * when the config names a client id, so an environment can be deployed before
 * anybody has registered an OAuth client — which is exactly the order a new
 * environment gets built in, and the reason the console's Checklist shows the
 * callback URL Google has to be told *before* it asks for the id.
 */
export class AcharAuthStack extends Stack {
  readonly userPool: cognito.IUserPool;
  /**
   * What the apps put in `NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID`, and what the
   * API stack hands the handlers as `USER_POOL_CLIENT_ID`.
   *
   * Published as properties rather than only as stack outputs because the values
   * are needed *within* this app, at synth time, by a stack that is deployed
   * right after this one — and a stack that read its own outputs back would be
   * reading CloudFormation rather than the object graph.
   */
  readonly userPoolClientId: string;
  readonly userPoolDomain: string;
  /** The authorized redirect URI Google has to be told. Shown by the console. */
  readonly googleCallbackUrl: string;

  constructor(scope: Construct, id: string, props: AcharAuthStackProps) {
    super(scope, id, props);

    const { config } = props;
    const own = ownershipOf(config).auth;

    if (!own) {
      const existing = importedResources(config);
      this.userPool = cognito.UserPool.fromUserPoolId(this, 'UserPool', existing.userPoolId);
      this.userPoolClientId = existing.userPoolClientId;
      this.userPoolDomain = existing.userPoolDomain;
      this.googleCallbackUrl = googleCallbackUrl(existing.userPoolDomain, config.region);

      new CfnOutput(this, 'UserPoolId', { value: existing.userPoolId });
      new CfnOutput(this, 'UserPoolClientId', { value: existing.userPoolClientId });
      new CfnOutput(this, 'UserPoolDomain', { value: existing.userPoolDomain });
      new CfnOutput(this, 'GoogleSignInEnabled', {
        value: String(existing.googleSignInEnabled),
      });
      new CfnOutput(this, 'GoogleCallbackUrl', {
        value: this.googleCallbackUrl,
        description: 'The authorized redirect URI Google has to be told',
      });
      return;
    }

    const pool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `achar-${config.stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      // Verification is required, not merely offered: an unverified address is one
      // that can be used to claim an invitation addressed to somebody else.
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // Which project the person was first invited to. Useful when the roster
        // of a pool outlives the project that created it.
        onboardedFrom: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        // No temporary-password expiry games: an invitation link is the thing that
        // expires, and a password that expires on its own schedule is one people
        // write down.
        tempPasswordValidity: Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const hasGoogle = Boolean(config.auth.googleClientId);

    /** The provider the app client names, when there is one. See the dependency below. */
    let google: cognito.UserPoolIdentityProviderGoogle | undefined;

    if (hasGoogle) {
      google = new cognito.UserPoolIdentityProviderGoogle(this, 'Google', {
        userPool: pool,
        clientId: config.auth.googleClientId,
        // `clientSecretValue`, not the deprecated `clientSecret`: the latter takes
        // a plain string, which would put the secret's *value* through this app
        // and into the template. This one stays a dynamic reference —
        // `{{resolve:secretsmanager:…}}` — which CloudFormation resolves at deploy
        // time. It has to be Secrets Manager rather than SSM, too:
        // `AWS::Cognito::UserPoolIdentityProvider` rejects an SSM Secure reference
        // in `ProviderDetails/client_secret` outright, naming the property in the
        // error.
        //
        // **By name, not through `Secret.fromSecretNameV2`.** That import looks
        // like the natural way to say this and it renders a *partial* ARN —
        // `…:secret:achar/dev/google-client-secret`, without the six random
        // characters Secrets Manager appends to a secret's real ARN, which CDK
        // cannot know at synth time. Secrets Manager does not resolve a partial
        // ARN: `GetSecretValue` answers
        //
        //   Secrets Manager can't find the specified secret.
        //
        // in the same words the deploy does, against a secret that is there.
        // `SecretValue.secretsManager()` is handed the name and passes it through
        // untouched, which resolves whether or not the value has been rotated.
        clientSecretValue: SecretValue.secretsManager(config.googleClientSecretName),
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          fullname: cognito.ProviderAttribute.GOOGLE_NAME,
        },
      });
    }

    // The Hosted UI domain has to be unique across every Cognito pool in the
    // world, so it carries the account id — a prefix of `achar-dev` would be
    // taken by whoever got there first.
    const domainPrefix = `achar-${config.stage}-${config.account}`;
    const domain = pool.addDomain('Domain', { cognitoDomain: { domainPrefix } });

    const client = pool.addClient('AppClient', {
      userPoolClientName: `achar-${config.stage}-apps`,
      // No secret: see this stack's own note.
      generateSecret: false,
      authFlows: {
        userSrp: true,
        // Kept for the CLI and for a script that has to sign in without a browser;
        // it is not what any app here uses.
        userPassword: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: config.auth.callbackUrls,
        logoutUrls: config.auth.logoutUrls,
      },
      supportedIdentityProviders: hasGoogle
        ? [cognito.UserPoolClientIdentityProvider.COGNITO, cognito.UserPoolClientIdentityProvider.GOOGLE]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      // A refresh token that never expires is a session nobody can end.
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    if (google) {
      // **The client has to wait for the provider, and nothing else says so.**
      //
      // `supportedIdentityProviders` is a list of provider *names* rather than a
      // reference to the provider resource, so CloudFormation is told about no
      // relationship between the two and is free to update the client first. It
      // does, and Cognito refuses the update while the pool has no such provider:
      //
      //   The provider Google does not exist for User Pool us-east-1_xxxxxxxxx
      //
      // That is a stage which already had a pool being given a Google client id
      // for the first time — the client is updated, the create of the provider is
      // never reached, and the stack rolls back. A stack built from nothing
      // usually gets away with it, because the provider tends to be created
      // before the client is; this dependency is what makes the order a fact
      // rather than a likelihood, and it costs one `DependsOn`.
      client.node.addDependency(google);
    }

    this.userPool = pool;
    this.userPoolClientId = client.userPoolClientId;
    this.userPoolDomain = domainPrefix;
    this.googleCallbackUrl = googleCallbackUrl(domainPrefix, config.region);

    new CfnOutput(this, 'UserPoolId', { value: pool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: client.userPoolClientId });
    new CfnOutput(this, 'UserPoolDomain', { value: domainPrefix });
    new CfnOutput(this, 'GoogleSignInEnabled', { value: String(hasGoogle) });
    new CfnOutput(this, 'GoogleCallbackUrl', {
      value: this.googleCallbackUrl,
      description: 'The authorized redirect URI Google has to be told',
    });
  }
}

/**
 * Where Cognito sends Google back to, which is the value that goes in Google's
 * console rather than in this repository.
 *
 * Google returns to Cognito and Cognito returns to the app, so this is the *first*
 * hop. It is derived from the pool's domain rather than configured, because it
 * belongs to Cognito and cannot be chosen — and a person who gets it wrong sees a
 * `redirect_uri_mismatch` page that names nothing in this repository, which is
 * why the console shows it as a copyable value before it asks for the client id.
 */
function googleCallbackUrl(domainPrefix: string, region: string): string {
  return `https://${domainPrefix}.auth.${region}.amazoncognito.com/oauth2/idpresponse`;
}
