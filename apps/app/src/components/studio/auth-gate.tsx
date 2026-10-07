'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AcharMark, Card, CardContent, Skeleton } from '@achar/ui';
import { SignIn, useViewer } from '@achar/auth';
import { AcharClientProvider } from '@/components/studio/client-provider';
import { routes } from '@/lib/routes';

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
 */
export function StudioGate({ apiUrl, children }: { apiUrl: string; children: React.ReactNode }) {
  const { viewer, loading } = useViewer();
  const pathname = usePathname();

  if (pathname === routes.signIn() || pathname === routes.authCallback()) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex w-full max-w-md flex-col items-center gap-4 px-6">
          <AcharMark className="size-8" />
          <Skeleton className="h-4 w-40 rounded-md" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!viewer) {
    return <SignInFrame />;
  }

  return <AcharClientProvider apiUrl={apiUrl}>{children}</AcharClientProvider>;
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
          <AcharMark className="size-9" />
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
          Not configured for this environment?{' '}
          <Link href="/" className="underline">
            Back to the studio
          </Link>
        </p>
      </div>
    </div>
  );
}
