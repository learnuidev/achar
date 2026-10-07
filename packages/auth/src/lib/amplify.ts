// Registered for the module's lifetime so a redirect back from the Cognito
// Hosted UI completes the sign-in. It must be imported on every page that can be
// a redirect target — importing it here covers whatever mounts `AuthProvider`.
// Safe on the server: the listener installs itself only when there is a browser.
import 'aws-amplify/auth/enable-oauth-listener';

import { Amplify } from 'aws-amplify';
import { fetchAuthSession } from 'aws-amplify/auth';

import { redirectUrls, type AcharAuthConfig } from './config';

/**
 * The config this module has already handed to Amplify.
 *
 * Amplify's own `configure` is not idempotent in the way that matters: it
 * publishes a `configure` event every time it is called, and the OAuth listener
 * treats that event as "an authorization code may be waiting to be exchanged".
 * Configuring twice with the same config is therefore a second attempt to spend
 * one single-use code, which fails as `invalid_grant` and reports a sign-in that
 * actually worked as a failure. Comparing first is the whole guard.
 */
let configured: string | null = null;

/**
 * Points Amplify at one Cognito user pool, once.
 *
 * Called by `AuthProvider` rather than by an import side effect: an app that
 * renders the setup screen for a missing config must never have configured
 * Amplify with a half-read one.
 */
export function configureAuth(config: AcharAuthConfig): void {
  const key = [
    config.region,
    config.userPoolId,
    config.userPoolWebClientId,
    config.domain,
    config.redirectSignIn,
    config.redirectSignOut,
  ].join('|');

  if (configured === key) return;
  configured = key;

  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.userPoolWebClientId,
        loginWith: {
          // Email is the sign-in name: a pool that accepts usernames as well
          // would be a second way to be the same person, and nothing here has an
          // opinion about what somebody is called.
          email: true,
          ...(config.domain
            ? {
                oauth: {
                  domain: config.domain,
                  scopes: ['email', 'openid', 'profile'],
                  redirectSignIn: redirectUrls(config.redirectSignIn),
                  redirectSignOut: redirectUrls(config.redirectSignOut),
                  // `code`, not `token`: the implicit flow puts the tokens in
                  // the fragment where any script on the page can read them.
                  responseType: 'code' as const,
                },
              }
            : {}),
        },
      },
    },
  });
}

/**
 * The caller's current Cognito ID token, or `null`.
 *
 * Null covers both "nobody is signed in" and "the session has lapsed and could
 * not be refreshed": `fetchAuthSession` throws for the first and answers without
 * an id token for the second, and every caller's next move is the same either
 * way. This is the token the API wants — an *ID* token, whose `sub` is the user
 * id every record is keyed by, rather than an access token, which names the
 * scopes and not the person.
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.idToken?.toString() ?? null;
  } catch {
    return null;
  }
}
