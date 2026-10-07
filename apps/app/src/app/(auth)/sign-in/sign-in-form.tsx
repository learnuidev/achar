'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { SignIn, useViewer } from '@achar/auth';
import { routes } from '@/lib/routes';

/**
 * Signing in, as a page.
 *
 * The studio's gate draws the same form over whatever somebody tried to open;
 * this route is for the links that point at signing in rather than at a screen —
 * a footer, a README, an email. Both render the auth package's `SignIn`, so the
 * product has one sign-in form rather than two that drift.
 *
 * Somebody already signed in is sent to the studio rather than shown a form they
 * do not need: the studio is the only surface here that has anything behind a
 * session, so it is where a signed-in person was going.
 *
 * A client component because of `useViewer`, which is why the metadata lives in
 * `page.tsx` beside it — a page cannot export metadata and `'use client'` at the
 * same time, and a title that said "Sign in" on the sign-up screen is the kind of
 * wrong that ends up in a browser history nobody can read.
 */
export function SignInForm() {
  const { viewer, loading } = useViewer();
  const params = useSearchParams();

  /**
   * Where to go afterwards: `?next=`, when it is a path on this site.
   *
   * Somebody sent here from the API reference's playground is signing in to mint a
   * token and try a request, and dropping them in the studio afterwards would lose
   * the page they were reading. Only a same-site path is accepted — a redirect
   * parameter that took an absolute URL would be a way to bounce somebody off the
   * site with our own sign-in screen.
   */
  const requested = params.get('next');
  const redirectTo = requested?.startsWith('/') && !requested.startsWith('//')
    ? requested
    : routes.projectPicker();

  if (!loading && viewer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="text-sm text-muted-foreground">
          You are already signed in as {viewer.email}.
        </p>
        <Link href={routes.projectPicker()} className="text-sm underline">
          Go to your projects
        </Link>
      </div>
    );
  }

  return (
    <SignIn
      title="Sign in to Achar"
      redirectTo={redirectTo}
      footer={
        <>
          No account yet?{' '}
          <Link href="/sign-up" className="text-foreground underline">
            Create one
          </Link>
        </>
      }
    />
  );
}
