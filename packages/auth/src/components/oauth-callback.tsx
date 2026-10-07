'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Hub } from 'aws-amplify/utils';

import { useAuthContext } from '../lib/context';

/**
 * Where a redirect back from the Cognito Hosted UI lands.
 *
 * The exchange itself is not performed here: Amplify's OAuth listener does it as
 * soon as Amplify is configured with an OAuth-enabled pool, and it announces the
 * result on the `auth` channel. So this page's job is the one the listener cannot
 * do — wait, then leave — and it is a page rather than an effect inside the app
 * because Cognito redirects to a URL, and a URL is a route.
 *
 * `redirectTo` defaults to the home page. The 10-second deadline exists because
 * "the code was exchanged before this component mounted", "the exchange is still
 * in flight" and "the provider sent us back with nothing" are indistinguishable
 * from here until one of them finishes, and a page that waits forever is a page
 * somebody reports as broken.
 *
 * The frame is the app's, the one every account screen wears
 * (`apps/app/src/components/auth/auth-frame.tsx`). The heading is drawn here
 * anyway, and it is the one heading in this package, because which heading it is
 * depends on the answer this screen is sitting and waiting for: a frame that had to
 * be told would have to be told from the outside, and the outside does not know.
 */
export function OAuthCallback({ redirectTo = '/' }: { redirectTo?: string }) {
  const { refresh, loading, signedIn } = useAuthContext();
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);

  const leave = useCallback(async () => {
    if (leaving.current) return;
    const viewer = await refresh();
    if (!viewer) return;
    // A ref rather than state: the Hub event and the session effect can both
    // arrive, and the second one must not start a second navigation.
    leaving.current = true;
    window.location.replace(redirectTo);
  }, [refresh, redirectTo]);

  useEffect(() => {
    if (!loading && signedIn) void leave();
  }, [loading, signedIn, leave]);

  useEffect(
    () =>
      Hub.listen('auth', ({ payload }) => {
        if (payload.event === 'signInWithRedirect') {
          void leave();
          return;
        }
        if (payload.event === 'signInWithRedirect_failure') {
          setError(providerMessage(payload.data));
        }
      }),
    [leave],
  );

  useEffect(() => {
    const deadline = setTimeout(() => {
      setError((current) => current ?? 'The sign-in did not complete. Try again from the sign-in page.');
    }, 10_000);
    return () => clearTimeout(deadline);
  }, []);

  return (
    <div className="space-y-3 text-center">
      {error ? (
        <>
          <h1 className="text-lg font-semibold tracking-tight">Sign-in did not finish</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </>
      ) : (
        <>
          <h1 className="text-lg font-semibold tracking-tight">Finishing sign-in</h1>
          <p className="text-sm text-muted-foreground">
            You will be taken back to the app in a moment.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * The provider's sentence, if it managed to send one.
 *
 * A failed exchange answers with an `AuthError` in `data.error`, and an
 * `invalid_grant` — the code already spent, or expired — is otherwise reported as
 * nothing at all.
 */
function providerMessage(data: unknown): string {
  const error = (data as { error?: { message?: unknown } } | undefined)?.error;
  if (error && typeof error.message === 'string' && error.message) return error.message;
  return 'The identity provider refused the sign-in. Try again from the sign-in page.';
}
