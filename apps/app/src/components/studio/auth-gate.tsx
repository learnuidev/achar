'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AcharMark, Card, CardContent, Skeleton } from '@achar/ui';
import { SignIn, useViewer } from '@achar/auth';
import { AcharClientProvider } from '@/components/client-provider';
import { useProfile } from '@/hooks/use-profile';
import { getStartedPath, routes } from '@/lib/routes';

/**
 * The wall, and the two doors in it that are not behind it.
 *
 * A configured environment with nobody signed in is a *sign-in* state, not an
 * error: the studio draws its own frame around the auth package's form, so that
 * the first screen of the product still looks like the product rather than like
 * a library's default page. `/sign-in` and `/auth/callback` are let through
 * untouched — they are how somebody gets out of this state, and gating them
 * would be a wall in front of the door.
 *
 * The API client is built here, once, rather than by each screen: everything
 * under the gate is signed in by definition, so this is the earliest point at
 * which there is a token to build one from.
 *
 * What is behind the wall is not always the studio, though, and that is
 * `OnboardingGate`'s business: somebody who has just made an account has nothing
 * here to open, and the picker with an empty grid is a worse answer to their first
 * question than being asked for an organization and a project name.
 */
export function StudioGate({ apiUrl, children }: { apiUrl: string; children: React.ReactNode }) {
  const { viewer, loading } = useViewer();
  const pathname = usePathname();

  if (pathname === routes.signIn() || pathname === routes.authCallback()) {
    return <>{children}</>;
  }

  if (loading) {
    return <GateSkeleton />;
  }

  if (!viewer) {
    return <SignInFrame />;
  }

  return (
    <AcharClientProvider apiUrl={apiUrl}>
      <OnboardingGate>{children}</OnboardingGate>
    </AcharClientProvider>
  );
}

/**
 * The last door: somebody with nothing to open is sent to onboarding.
 *
 * It is here rather than on the picker because the picker is not the only way in:
 * an invitation link, a bookmark, a link to a document somebody was sent — all of
 * them land on a screen about a project this person does not have. The question
 * "have you anything to open" has one answer for all of them, so it is asked once,
 * above them.
 *
 * **No projects and no invitations**, which is two counts and not one.
 * `invitationCount` is the half that matters: an offer addressed to somebody who
 * has never opened the studio is exactly the state this would otherwise send to
 * onboarding, where the offer cannot be seen or accepted.
 *
 * A profile that could not be read leaves the studio open. The gate is a
 * convenience — a first-run redirect — and a read that failed must not become a
 * closed door; the screens underneath answer their own errors, and the one thing
 * a person can do about a broken API is not to be asked for a project name.
 */
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const profile = useProfile();

  const firstRun =
    profile.data !== null && profile.data.projectCount === 0 && profile.data.invitationCount === 0;

  useEffect(() => {
    if (firstRun) router.replace(getStartedPath);
  }, [firstRun, router]);

  // The skeleton covers both the wait for the answer and the moment between the
  // redirect and the route actually changing.
  if (profile.loading || firstRun) {
    return <GateSkeleton />;
  }

  return <>{children}</>;
}

/** What the studio draws before it knows whether it is drawing the studio. */
function GateSkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex w-full max-w-md flex-col items-center gap-4 px-6">
        <AcharMark className="h-8" />
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * The studio's own sign-in screen.
 *
 * Deliberately the same frame as the setup screen and the same mark as the rail:
 * somebody arriving here has been sent a link to a document, and the two things
 * they need to know are which product they are signing in to and that signing in
 * is the whole of what is being asked.
 */
export function SignInFrame({
  title = 'Sign in to Achar Studio',
  description = 'Your projects, their datasets, and the content in them.',
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <AcharMark className="h-9" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        <Card className="w-full">
          <CardContent className="pt-6">
            <SignIn />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          No account yet?{' '}
          <Link href="/sign-up" className="underline">
            Create one
          </Link>{' '}
          — or{' '}
          <Link href="/" className="underline">
            back to the site
          </Link>
        </p>
      </div>
    </div>
  );
}
