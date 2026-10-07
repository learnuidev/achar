'use client';

import Link from 'next/link';
import { useSignedIn } from '@achar/auth';
import { Button, ThemeToggle } from '@achar/ui';
import { routes } from '@/lib/routes';
import type { Cta } from '@/content/types';

/**
 * The buttons at the right of the site's bar, and the one thing that changes them.
 *
 * Somebody who is signed in has already been persuaded. The content call to
 * action in this bar is written for a visitor who has no account, and offering
 * "start building" to the person who is looking at the product they already use
 * is the bar asking a question it has already had answered — so the session
 * replaces that pair with the one door that is useful now, into the studio.
 *
 * This is the only place on the public site that reads the session, which is why
 * it is a client component of its own rather than the bar: everything else in the
 * header is markup, and markup the server can render is markup the browser does
 * not have to wait for.
 *
 * The session is read in the browser, so the first paint is always the signed-out
 * pair and a signed-in visitor sees it for a frame. That is the deliberate half
 * of the trade: the alternative is a bar that draws no action at all until the
 * session resolves, which shows every visitor a gap where the site's one
 * conversion is supposed to be.
 */
export function SiteActions({ cta }: { cta: Cta }) {
  const signedIn = useSignedIn();

  if (!signedIn) return <SignedOutActions cta={cta} />;

  return (
    <>
      <ThemeToggle />
      <Button asChild variant="outline" size="sm">
        <Link href={routes.projectPicker()}>Go to console</Link>
      </Button>
    </>
  );
}

/**
 * The pair a visitor gets — and the pair a deployment with no user pool gets too.
 *
 * Exported because the bar needs it on both of those paths: `SiteActions` falls
 * back to it for somebody who is not signed in, and the site's layout renders it
 * directly when there is no pool, where there is no provider above it to call
 * `useSignedIn` under. A hook that threw there would take the whole site down
 * over one button.
 */
export function SignedOutActions({ cta }: { cta: Cta }) {
  return (
    <>
      <Link
        href="/sign-in"
        className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
      >
        Sign in
      </Link>
      <ThemeToggle />
      <Button asChild size="sm">
        <Link href={cta.href}>{cta.label}</Link>
      </Button>
    </>
  );
}
