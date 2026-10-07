'use client';

import { useEffect, useState } from 'react';
import { signIn, signInWithRedirect } from 'aws-amplify/auth';

import { useAuthContext } from '../lib/context';

const field =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * The sign-in screen: an email and a password, and Google when the deployment
 * has a Hosted UI domain.
 *
 * Drawn with plain Tailwind classes and the tokens the apps already define rather
 * than with `@achar/ui`, which would be a cycle: the design system is what the
 * signed-in product draws with, and asking it to render the screen that gets you
 * into that product makes the two packages depend on each other.
 *
 * Google is offered only when there is a domain to redirect to. A button that
 * leads to a Cognito error is worse than a button that is not there.
 */
export function SignIn({
  title = 'Sign in',
  redirectTo,
}: {
  title?: string;
  redirectTo?: string;
}) {
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
      setError(messageOf(failure));
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
      setError(messageOf(failure));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>

        {signedIn && !redirectTo ? (
          <p className="mt-4 text-sm text-muted-foreground">You are signed in.</p>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={withPassword}>
            <label className="block space-y-2">
              <span className="text-sm font-medium">Email</span>
              <input
                className={field}
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
              <span className="text-sm font-medium">Password</span>
              <input
                className={field}
                type="password"
                name="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Sign in'}
            </button>

            {config.domain ? (
              <>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={withGoogle}
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  Continue with Google
                </button>
              </>
            ) : null}
          </form>
        )}

        {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
        {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      </div>
    </div>
  );
}

/**
 * What a sign-in step means, in a sentence.
 *
 * The codes are Cognito's, and printing the code raw puts a token like
 * `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` in front of somebody who is trying
 * to get to work. Anything unrecognised is reported as a step rather than
 * guessed at.
 */
function stepSentence(step: string): string {
  switch (step) {
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'This account needs a new password before it can sign in. Reset it and try again.';
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return 'Enter the code from your authenticator app to finish signing in.';
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
      return 'A verification code has been sent to you. Enter it to finish signing in.';
    case 'CONFIRM_SIGN_UP':
      return 'This account has not been confirmed yet. Check your email for the confirmation code.';
    case 'RESET_PASSWORD':
      return 'This account has to reset its password before it can sign in.';
    default:
      return `This account needs one more step (${step}) before it can sign in.`;
  }
}

/** The provider's own sentence when there is one, and a plain one when there is not. */
function messageOf(failure: unknown): string {
  if (failure instanceof Error && failure.message) return failure.message;
  return 'Sign-in failed. Check the email and password and try again.';
}
