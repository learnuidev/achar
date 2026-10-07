'use client';

import Link from 'next/link';
import { SignUp } from '@achar/auth';
import { AuthFrame } from '@/components/auth/auth-frame';
import { routes } from '@/lib/routes';

/**
 * Creating an account, as a page.
 *
 * The counterpart of `/sign-in`, and the reason both exist as routes rather than
 * only as the studio's inline gate: an invitation, a footer link and a README all
 * point at a URL, and a product whose only door is drawn over a screen somebody
 * has to guess at is a product with no door.
 *
 * Same frame as signing in, with the account-making words in it: somebody who
 * followed a link to the wrong one of the two finds the link to the other under
 * the card rather than a browser's back button.
 *
 * Confirming the address is part of the flow rather than a later nag — the pool
 * requires a verified email, because an unverified address is one that can be
 * used to claim an invitation addressed to somebody else.
 */
export function SignUpForm() {
  return (
    <AuthFrame
      title="Create your Achar account"
      description="An account, then a project and a dataset to author against."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="text-foreground underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUp redirectTo={routes.projectPicker()} />
    </AuthFrame>
  );
}
