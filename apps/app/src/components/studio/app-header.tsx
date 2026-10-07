'use client';

import Link from 'next/link';
import { LogOutIcon } from 'lucide-react';
import { useViewer } from '@achar/auth';
import { AcharMark, Button, ThemeToggle } from '@achar/ui';

/**
 * The bar the studio wears when there is no dataset around it.
 *
 * The project picker, a project's datasets, its members and its settings are all
 * outside the studio shell — there is no rail to hang a title on and no dataset
 * to switch — so they get this: the mark, what the screen is, and the two
 * controls that belong to the person rather than to the content. The rail has
 * its own copy of those in its footer; this one exists so that a screen without
 * a rail is not also a screen without a way to sign out.
 */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { viewer, signOut } = useViewer();

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-card px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          <AcharMark className="size-6" />
          <span className="text-sm font-medium">Achar Studio</span>
        </Link>
        {children}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {viewer?.email && (
          <span className="hidden text-xs text-muted-foreground sm:inline">{viewer.email}</span>
        )}
        <ThemeToggle />
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}

/** The page underneath the bar, with the studio's reading width. */
export function AppPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl space-y-6 p-6">{children}</div>
    </div>
  );
}
