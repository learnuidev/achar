import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import { routes } from '@/lib/routes';

/**
 * What the two account screens share: the providers, and nothing drawn.
 *
 * A group of its own, because signing in belongs to neither surface: the site's
 * footer under a login form is marketing in the way of the task, and the studio's
 * gate is what these pages let somebody *out* of, so wrapping them in it would be a
 * wall in front of the door. What they draw instead is `AuthFrame` — the site's bar,
 * the wordmark, the heading and the card — which is the same frame the studio's
 * gate, its sign-in route, the OAuth callback and onboarding wear.
 *
 * The site's *bar* is in that frame on purpose, and is the one piece of the site's
 * chrome these pages carry: somebody who followed a link to a form they cannot fill
 * in should be able to go and read what the product is rather than only reach for
 * the back button.
 *
 * The providers are here rather than at the root for the reason the chrome is:
 * `AuthProvider` configures Amplify, and the pages that need it are the pages that
 * are about signing in. The one other place that carries it is the site's own bar,
 * which reads the session to decide which buttons it draws — `(site)/layout.tsx`
 * mounts a provider for that, and it is the only other page-level surface that
 * does. Nothing at the root, so a surface that renders no button answerable to a
 * session still loads none of the SDK.
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
