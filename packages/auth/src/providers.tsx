'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Viewer } from '@achar/types';
import { fetchAuthSession, signOut as amplifySignOut } from 'aws-amplify/auth';
import { Hub } from 'aws-amplify/utils';

import { AuthContext, type AuthContextValue } from './lib/context';
import { configureAuth, getAccessToken } from './lib/amplify';
import { authConfigFromEnv, type AcharAuthConfig } from './lib/config';

/**
 * The session, for everything under it.
 *
 * `config` may be passed by hand — a test, a preview deployment, a console
 * starting an app against an environment it has just created — or left off, in
 * which case it comes from the `NEXT_PUBLIC_*` variables the app was built with.
 * That is why this is two components: the choice between "configured" and
 * "nothing to configure with" happens before any hook runs, so neither branch
 * breaks the order hooks have to be called in.
 */
export function AuthProvider({
  config,
  children,
}: {
  config?: AcharAuthConfig;
  children: React.ReactNode;
}) {
  const resolved = config ?? authConfigFromEnv();
  if (!resolved) return <AuthNotConfigured />;

  return <SessionProvider config={resolved}>{children}</SessionProvider>;
}

/**
 * The session, once there is a pool to read it from.
 *
 * The viewer is read from the ID token rather than fetched from the API: every
 * screen that draws "your" content needs the caller's id before it can ask for
 * anything, and a round trip to learn what the token already says is a round trip
 * that can fail on its own.
 */
function SessionProvider({
  config,
  children,
}: {
  config: AcharAuthConfig;
  children: React.ReactNode;
}) {
  // During render rather than in an effect: a child that signs somebody in on its
  // first paint needs Amplify to know where the pool is, and an effect runs after
  // the children have already rendered. `configureAuth` is idempotent, so a
  // StrictMode double render costs one string comparison.
  configureAuth(config);

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (): Promise<Viewer | null> => {
    const next = await readViewer();
    setViewer(next);
    setLoading(false);
    return next;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    // Amplify announces every session change on the `auth` channel — a password
    // sign-in, a redirect back from the Hosted UI, a refresh, a sign-out in
    // another tab — and the viewer has to be re-read for each of them, not only
    // at mount. The subscription is per provider rather than global because the
    // provider is what owns the state it writes to.
    return Hub.listen('auth', () => {
      void refresh();
    });
  }, [refresh]);

  const signOut = useCallback(async () => {
    // No `redirectUrl`: signing out through the Hosted UI's logout endpoint is a
    // full page navigation to Cognito and back, which loses whatever the app was
    // showing. Clearing the tokens here leaves the app in charge of where the
    // person lands — with the caveat that Cognito's own session cookie survives,
    // so a later Google sign-in will not ask again until it expires.
    await amplifySignOut();
    setViewer(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      viewer,
      loading,
      signedIn: viewer !== null,
      signOut,
      getToken: getAccessToken,
      refresh,
      config,
    }),
    [viewer, loading, signOut, refresh, config],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * What an app renders when it has no user pool to point at.
 *
 * Drawn here rather than left to each app because the variables are this
 * package's: an app that had to know which of them are required would be an app
 * with a second copy of `authConfigFromEnv`, and the two would drift. An app with
 * its own setup screen passes a `config` and never sees this.
 */
function AuthNotConfigured() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-lg rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <h1 className="text-lg font-semibold tracking-tight">Sign-in is not configured</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Set these in <code className="font-mono text-xs">.env.local</code> and restart the
          dev server:
        </p>
        <ul className="mt-3 space-y-1 font-mono text-xs text-muted-foreground">
          <li>NEXT_PUBLIC_ACHAR_REGION</li>
          <li>NEXT_PUBLIC_ACHAR_USER_POOL_ID</li>
          <li>NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID</li>
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          Google sign-in additionally needs NEXT_PUBLIC_ACHAR_AUTH_DOMAIN.
        </p>
      </div>
    </div>
  );
}

/**
 * Who the token says is asking.
 *
 * The claims are read defensively because Cognito's payload is whatever the pool
 * was configured to put in it: `email` is absent when the pool has no email
 * attribute, a name is optional by definition, and a viewer built from a missing
 * claim would be a crash in the one place every signed-in screen passes through.
 */
async function readViewer(): Promise<Viewer | null> {
  try {
    const session = await fetchAuthSession();
    const payload = session.tokens?.idToken?.payload;
    if (!payload || typeof payload.sub !== 'string') return null;

    const name = payload.name ?? payload['cognito:username'];

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof name === 'string' ? name : null,
    };
  } catch {
    // No session, or one that could not be refreshed. Both are "nobody".
    return null;
  }
}
