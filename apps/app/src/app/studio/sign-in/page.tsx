'use client';

import Link from 'next/link';
import { useViewer } from '@achar/auth';
import { Button } from '@achar/ui';
import { SignInFrame } from '@/components/studio/auth-gate';
import { routes } from '@/lib/routes';

/**
 * Signing in, as a page.
 *
 * The gate draws the same screen *over* whatever somebody tried to open; this
 * route exists for the links that point at signing in rather than at a screen.
 * Both render `SignInFrame`, so the product has one sign-in screen rather than
 * two that drift.
 */
export default function SignInPage() {
  const { viewer, loading } = useViewer();

  if (!loading && viewer) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6">
        <p className="text-sm text-muted-foreground">
          You are already signed in as {viewer.email}.
        </p>
        <Button asChild>
          <Link href={routes.projectPicker()}>Go to your projects</Link>
        </Button>
      </div>
    );
  }

  return <SignInFrame />;
}
