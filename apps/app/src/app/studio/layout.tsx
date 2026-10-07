import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import { StudioGate } from '@/components/studio/auth-gate';
import { routes } from '@/lib/routes';
import { SetupScreen } from '@/components/studio/setup-screen';

export const metadata: Metadata = {
  title: 'Achar Studio',
  description:
    'The content studio: pick a project and a dataset, edit the documents its schema declares, and publish them.',
};

/**
 * The studio's own layout, and the decision that comes before any screen in it.
 *
 * It is a segment rather than a group, because the studio *is* a path — `/studio`
 * — and because the two surfaces of this app have to be told apart by a URL
 * rather than by a convention somebody can forget: nothing below this point is
 * public, and nothing above it is private.
 *
 * Two things are settled here rather than in each page. The first is the theme,
 * which is a class on `<html>` and therefore belongs above everything. The
 * second is whether there is a deployment to talk to at all: `authConfigFromEnv`
 * is read once, and when it finds nothing the whole app is the setup screen.
 * That is not a fallback — a studio with no API has no projects to pick, no
 * schemas to read and no documents to list, so drawing the studio and letting
 * every panel inside it fail would be four error states describing one missing
 * file.
 *
 * Rendered per request rather than at build time: the environment a studio is
 * pointed at is a runtime fact, and a prerendered setup screen would outlive the
 * file that made it wrong.
 */
export const dynamic = 'force-dynamic';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  // The callback Cognito returns a sign-in to is the studio's own path, taken
  // from the route table rather than spelled here: the two have to agree, and
  // the one place they can disagree silently is a string literal in a layout.
  const config = authConfigFromEnv({ callbackPath: routes.authCallback() });

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {config ? (
        <AuthProvider config={config}>
          <StudioGate apiUrl={config.apiUrl}>{children}</StudioGate>
        </AuthProvider>
      ) : (
        <SetupScreen />
      )}
      <Toaster />
    </ThemeProvider>
  );
}
