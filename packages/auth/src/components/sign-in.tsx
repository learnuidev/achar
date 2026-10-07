'use client';

import { useEffect, useState } from 'react';
import { signIn, signInWithRedirect } from 'aws-amplify/auth';

import { useAuthContext } from '../lib/context';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../lib/field';
import { messageOf, stepSentence } from '../lib/messages';

/**
 * The sign-in form: an email and a password, and Google when the deployment has a
 * Hosted UI domain.
 *
 * What is here is what is Cognito's business — the two calls, the step a pool with
 * MFA answers with, and the sentence a failure becomes. The screen around it is
 * not: the mark, the heading, the card and the link to the sign-up screen belong
 * to whoever draws this, which is `apps/app/src/components/auth/auth-frame.tsx`.
 * That split is what lets `/sign-in`, `/sign-up` and the studio's own sign-in
 * screen be one frame with different words rather than three screens that drift,
 * and it is why this returns a body with no heading of its own.
 *
 * Drawn with plain Tailwind classes and the tokens the apps already define rather
 * than with `@achar/ui`, which would be a cycle: the design system is what the
 * signed-in product draws with, and asking it to render the screen that gets you
 * into that product makes the two packages depend on each other.
 *
 * Google is offered only when there is a domain to redirect to. A button that
 * leads to a Cognito error is worse than a button that is not there.
 */
export function SignIn({ redirectTo }: { redirectTo?: string }) {
  const { config, loading, signedIn, refresh } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && signedIn && redirectTo) window.location.assign(redirectTo);
  }, [loading, signedIn, redirectTo]);

  async function withPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await signIn({ username: email, password });
      if (!result.isSignedIn) {
        // A pool with MFA, or one that forces a password change, answers with a
        // step rather than a session — and naming the step is the difference
        // between "that did not work" and "there is a code in your inbox".
        setNotice(stepSentence(result.nextStep.signInStep));
        return;
      }
      await refresh();
      if (redirectTo) window.location.assign(redirectTo);
    } catch (failure) {
      setError(messageOf(failure, 'Sign-in failed. Check the email and password and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    try {
      // Away to the Hosted UI and back to `/auth/callback`, where the app's
      // `OAuthCallback` picks the session up. Nothing after this line runs.
      await signInWithRedirect({ provider: 'Google' });
    } catch (failure) {
      setError(messageOf(failure, 'Could not reach Google just now. Try again.'));
      setBusy(false);
    }
  }

  return (
    <>
      {signedIn && !redirectTo ? (
        <p className="text-sm text-muted-foreground">You are signed in.</p>
      ) : (
        <form className="space-y-4" onSubmit={withPassword}>
          <label className="block space-y-2">
            <span className={labelClass}>Email</span>
            <input
              className={fieldClass}
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className={labelClass}>Password</span>
            <input
              className={fieldClass}
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          {config.domain ? (
            <>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>

              <button type="button" disabled={busy} onClick={withGoogle} className={secondaryButtonClass}>
                Continue with Google
              </button>
            </>
          ) : null}
        </form>
      )}

      {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
    </>
  );
}
