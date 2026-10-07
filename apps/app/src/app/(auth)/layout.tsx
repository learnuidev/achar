import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import { routes } from '@/lib/routes';

/**
 * The frame the two account screens share.
 *
 * A group of its own, because signing in belongs to neither surface: the site's
 * header and footer around a login form would be marketing in the way of the
 * task, and the studio's gate is what these pages let somebody *out* of, so
 * wrapping them in it would be a wall in front of the door.
 *
 * The providers are here rather than at the root for the reason the chrome is:
 * `AuthProvider` configures Amplify, and the public site should not carry the
 * identity provider's SDK on every page it renders to somebody who will never
 * sign in.
 *
 * The callback path is the studio's, from the route table, because that is the
 * URL the Cognito client has registered — a Google sign-in started from here
 * comes back to `/studio/auth/callback`, and the two have to agree.
 */
export const metadata: Metadata = {
  title: 'Sign in — Achar',
  description: 'Sign in to Achar, or create an account.',
};

/** The environment a deployment is pointed at is a runtime fact, not a build one. */
export const dynamic = 'force-dynamic';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const config = authConfigFromEnv({ callbackPath: routes.authCallback() });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {/* No `config` means no pool, and `AuthProvider` answers with the screen
          that names the variables to set rather than a form that cannot work. */}
      <AuthProvider config={config ?? undefined}>{children}</AuthProvider>
      <Toaster />
    </ThemeProvider>
  );
}
