import type { Metadata } from 'next';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import './globals.css';
import { StudioGate } from '@/components/studio/auth-gate';
import { SetupScreen } from '@/components/studio/setup-screen';

export const metadata: Metadata = {
  title: 'Achar Studio',
  description:
    'The content studio: pick a project and a dataset, edit the documents its schema declares, and publish them.',
};

/**
 * The root of the studio, and the decision that comes before any screen.
 *
 * Two things are settled here rather than in each page. The first is the theme,
 * which is a class on `<html>` and therefore belongs above everything. The
 * second is whether there is a deployment to talk to at all: `authConfigFromEnv`
 * is read once, and when it finds nothing the whole app is the setup screen.
 * That is not a fallback — a studio with no API has no projects to pick, no
 * schemas to read and no documents to list, so drawing the shell and letting
 * every panel inside it fail would be four error states describing one missing
 * file.
 *
 * Rendered per request rather than at build time: the environment a studio is
 * pointed at is a runtime fact, and a prerendered setup screen would outlive the
 * file that made it wrong.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const config = authConfigFromEnv();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
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
      </body>
    </html>
  );
}
