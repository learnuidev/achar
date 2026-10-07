import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import { routes } from '@/lib/routes';

/**
 * What onboarding wears: a theme and a session, and nothing else.
 *
 * A group of its own for the reason the account screens have one. The site's
 * header and footer would be a menu in front of a four-question flow, and the
 * studio's frame would be a rail, a project switcher and a sign-out button around
 * a person who has no project to switch to — the flow is the one screen that is
 * neither surface, so it draws its own chrome and borrows only what it has to.
 *
 * What it borrows is what `/studio` borrows: the theme, because the tokens are a
 * class on `<html>`, and the session, because a project has to belong to somebody.
 * The API client is not here: it is built by the flow, once there is a viewer to
 * build it for, so that somebody who arrives signed out is asked to sign in rather
 * than shown a spinner while a client with no token is assembled.
 *
 * No `config` means no pool, and `AuthProvider` answers with the screen naming the
 * variables to set. That is the right answer here as well as in the studio: a
 * project cannot be made by nobody.
 */
export const dynamic = 'force-dynamic';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const config = authConfigFromEnv({ callbackPath: routes.authCallback() });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <AuthProvider config={config ?? undefined}>{children}</AuthProvider>
      <Toaster />
    </ThemeProvider>
  );
}
