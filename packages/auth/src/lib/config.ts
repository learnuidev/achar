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
  /**
   * Where Cognito sends the browser back to after a sign-in, and where a sign-out
   * lands — as **paths**, or as absolute URLs if whoever built this config knows
   * its own domain.
   *
   * Paths, because the origin is not knowable where this is built. Both of Achar's
   * own apps read this in a Next *layout*, which renders on the server, where
   * `window.location.origin` is nothing; `configureAuth` resolves them in the
   * browser, which is the only place that knows. See `absoluteRedirectUrls`.
   */
  redirectSignIn: string;
  redirectSignOut: string;
}

/**
 * The path an app registers with Cognito as a callback URL.
 *
 * Defaulted rather than fixed, because where the callback lives is a property of
 * the app that hosts it: Achar's own app serves the studio under `/studio`, so its
 * callback is `/studio/auth/callback`, while a leaf client of the API can put it
 * wherever it likes. A constant would make one of those two wrong.
 */
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
export function authConfigFromEnv(options: { callbackPath?: string } = {}): AcharAuthConfig | null {
  const region = process.env.NEXT_PUBLIC_ACHAR_REGION;
  const userPoolId = process.env.NEXT_PUBLIC_ACHAR_USER_POOL_ID;
  const userPoolWebClientId = process.env.NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID;

  if (!region || !userPoolId || !userPoolWebClientId) return null;

  return {
    region,
    userPoolId,
    userPoolWebClientId,
    domain: process.env.NEXT_PUBLIC_ACHAR_AUTH_DOMAIN ?? '',
    apiUrl: process.env.NEXT_PUBLIC_ACHAR_API_URL ?? '',
    // Paths, not URLs. This ran on the server — in a layout — for as long as it
    // has existed, where `window.location.origin` is the empty string, so the
    // sign-in value was `/studio/auth/callback` and the sign-out value was `''`.
    // Amplify matched neither against the page it was on and refused the redirect
    // outright: "signInRedirect or signOutRedirect had an invalid format or was
    // not found". Nothing was wrong with the pool; the config had been stripped of
    // the one part only a browser knows.
    redirectSignIn: options.callbackPath ?? oauthCallbackPath,
    redirectSignOut: '/',
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

/**
 * The same list, as absolute URLs for one origin.
 *
 * Amplify does not accept a relative redirect: it chooses one by matching the
 * configured values against `window.location` — same origin and pathname, then
 * same hostname, then any `http(s)://` at all — and a path matches none of those,
 * so the sign-in is refused before Cognito is ever reached. The origin is passed
 * in rather than read here so that this stays a function of its arguments, and so
 * that the one place that touches `window` is the one place that configures
 * Amplify.
 *
 * `/` becomes the bare origin, without a trailing slash: a sign-out returns to the
 * site's front door, and the user pool's logout URLs are written that way, which
 * Cognito compares literally.
 */
export function absoluteRedirectUrls(value: string, origin: string): string[] {
  return redirectUrls(value).map((url) => {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    if (url === '' || url === '/') return origin;
    return `${origin}${url.startsWith('/') ? '' : '/'}${url}`;
  });
}
