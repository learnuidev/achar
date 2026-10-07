/**
 * Everything an app has to tell this package about where its identity provider
 * and its API are.
 *
 * It is a value rather than a set of environment lookups so that it can be built
 * by hand in a test, in a preview deployment, or by a console that starts an app
 * against an environment it just created.
 */
export interface AcharAuthConfig {
  region: string;
  userPoolId: string;
  userPoolWebClientId: string;
  /** The Cognito Hosted UI domain. Empty means password sign-in only. */
  domain: string;
  apiUrl: string;
  redirectSignIn: string;
  redirectSignOut: string;
}

/** The path an app registers with Cognito as a callback URL. */
export const oauthCallbackPath = '/auth/callback';

/**
 * The config, read from the `NEXT_PUBLIC_*` variables — or `null`.
 *
 * `null` rather than a throw, and nothing here is loaded lazily: an app with no
 * user pool configured should be able to render a setup screen rather than crash
 * on import, which is the difference between a deployment somebody can diagnose
 * and a blank page.
 *
 * The essentials are the region, the pool and the client. An API URL is not one
 * of them: sign-in works against a pool alone, and an app that wants the API
 * without accounts is a real thing to build.
 *
 * Each variable is read by its own literal name because that is the only form
 * Next inlines — a loop over a list of names builds a bundle where every one of
 * them is `undefined`, which fails at runtime in a way nothing points at.
 */
export function authConfigFromEnv(): AcharAuthConfig | null {
  const region = process.env.NEXT_PUBLIC_ACHAR_REGION;
  const userPoolId = process.env.NEXT_PUBLIC_ACHAR_USER_POOL_ID;
  const userPoolWebClientId = process.env.NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID;

  if (!region || !userPoolId || !userPoolWebClientId) return null;

  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  return {
    region,
    userPoolId,
    userPoolWebClientId,
    domain: process.env.NEXT_PUBLIC_ACHAR_AUTH_DOMAIN ?? '',
    apiUrl: process.env.NEXT_PUBLIC_ACHAR_API_URL ?? '',
    redirectSignIn: `${origin}${oauthCallbackPath}`,
    redirectSignOut: origin,
  };
}

/**
 * A configured URL as the list Cognito wants.
 *
 * Comma-separated, because one deployment serves several origins — localhost
 * during development and the deployed domain in production are one app against
 * one user pool, and a callback URL list is the only place that can be said.
 */
export function redirectUrls(value: string): string[] {
  const urls = value
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  return urls.length > 0 ? urls : [value];
}
