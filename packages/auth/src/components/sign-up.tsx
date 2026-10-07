'use client';

import { useState } from 'react';
import { confirmSignUp, resendSignUpCode, signIn, signInWithRedirect, signUp } from 'aws-amplify/auth';

import { useAuthContext } from '../lib/context';
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../lib/field';
import { messageOf, stepSentence } from '../lib/messages';

/**
 * The sign-up form: an address, a name and a password, then the code Cognito
 * emails.
 *
 * Two steps rather than one, because the second one is not a formality: the pool
 * requires a verified address, and an unverified one can be used to claim an
 * invitation addressed to somebody else. So the screen that collects the code is
 * the same screen that collected the password, and the password is kept in memory
 * between them so confirming signs the person straight in rather than handing
 * them back a form they have already filled in once.
 *
 * A form rather than a screen, for the reason `sign-in.tsx` gives: the frame
 * around it — the mark, the heading, the card, the link to signing in — is the
 * app's, and it is the same frame the sign-in screen wears.
 *
 * Google is offered here for the same reason it is offered on the sign-in screen:
 * signing up with a provider and signing in with one are the same act, and a page
 * that made somebody choose the right verb would be a page that loses customers
 * who guessed wrong.
 */
export function SignUp({ redirectTo }: { redirectTo?: string }) {
  const { config, refresh } = useAuthContext();
  const [stage, setStage] = useState<'details' | 'confirm'>('details');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Signs the new account in with the credentials this screen is already holding. */
  async function enter() {
    const result = await signIn({ username: email, password });
    if (!result.isSignedIn) {
      setNotice(stepSentence(result.nextStep.signInStep));
      return;
    }
    await refresh();
    if (redirectTo) window.location.assign(redirectTo);
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await signUp({
        username: email,
        password,
        options: { userAttributes: { email, ...(name.trim() ? { name: name.trim() } : {}) } },
      });

      if (result.nextStep.signUpStep === 'CONFIRM_SIGN_UP') {
        setStage('confirm');
        setNotice(`We sent a confirmation code to ${email}.`);
        return;
      }

      // A pool that confirms addresses itself, or an account an admin has already
      // confirmed: there is nothing to wait for, so sign in now.
      await enter();
    } catch (failure) {
      setError(messageOf(failure, 'That did not work. Check the address and the password and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      await confirmSignUp({ username: email, confirmationCode: code.trim() });
      await enter();
    } catch (failure) {
      setError(messageOf(failure, 'That code was not accepted. Check it and try again.'));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await resendSignUpCode({ username: email });
      setNotice(`Another code is on its way to ${email}.`);
    } catch (failure) {
      setError(messageOf(failure, 'Could not send another code just now.'));
    } finally {
      setBusy(false);
    }
  }

  async function withGoogle() {
    setBusy(true);
    setError(null);
    try {
      // Away to the Hosted UI and back to the app's callback, where
      // `OAuthCallback` picks the session up. Nothing after this line runs.
      await signInWithRedirect({ provider: 'Google' });
    } catch (failure) {
      setError(messageOf(failure, 'Could not reach Google just now.'));
      setBusy(false);
    }
  }

  return (
    <>
      {stage === 'details' ? (
        <form className="space-y-4" onSubmit={createAccount}>
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
            <span className={labelClass}>
              Your name <span className="text-muted-foreground">(optional)</span>
            </span>
            <input
              className={fieldClass}
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Ada Lovelace"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block space-y-2">
            <span className={labelClass}>Password</span>
            <input
              className={fieldClass}
              type="password"
              name="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {/* The pool's rule, said before it is broken rather than after: see
                `passwordPolicy` in `infra/src/stacks/auth-stack.ts`. */}
            <span className="block text-xs text-muted-foreground">
              At least 10 characters, with an uppercase letter, a lowercase letter and a digit.
            </span>
          </label>

          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Creating your account…' : 'Create account'}
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
                className={secondaryButtonClass}
              >
                Continue with Google
              </button>
            </>
          ) : null}
        </form>
      ) : (
        <form className="space-y-4" onSubmit={confirm}>
          <p className="text-sm text-muted-foreground">
            We sent a code to <span className="font-medium text-foreground">{email}</span>. Enter
            it to finish creating the account.
          </p>

          <label className="block space-y-2">
            <span className={labelClass}>Confirmation code</span>
            <input
              className={fieldClass}
              type="text"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </label>

          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? 'Confirming…' : 'Confirm and sign in'}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={resend}
            className={secondaryButtonClass}
          >
            Send another code
          </button>
        </form>
      )}

      {notice ? <p className="mt-4 text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
    </>
  );
}
