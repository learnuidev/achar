import type { Metadata } from 'next';
import { Toaster } from '@achar/ui';
import { AuthProvider, authConfigFromEnv } from '@achar/auth';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeProvider } from '@/components/site/theme-provider';
import { getSiteSettings } from '@/content';
import { routes } from '@/lib/routes';
import { siteUrl } from '@/lib/site';


/**
 * The site's frame: the theme, the bar, the page, the footer.
 *
 * A route group rather than the root layout, because the studio is served from
 * the same app and must not be wrapped in any of this — see `app/layout.tsx`.
 * The group adds no URL segment, so every page in here is still at the path it
 * was published at.
 *
 * The metadata comes from the `siteSettings` document rather than from a constant
 * in this file, which is the same decision the rest of the site makes — the title
 * of the site is content, and the person who renames the product should not be
 * opening a pull request to do it.
 *
 * Nothing here reads the request on purpose. `params` and `searchParams` are the
 * page's business, and the only thing the frame needs from a request is nothing at
 * all: the session the bar draws is a browser fact, and it is read in the browser.
 *
 * The metadata is generated here rather than in the root layout for the same
 * reason the chrome lives here: the studio's title is its own, and a marketing
 * site's tagline is not a fact about a schema editor.
 *
 * The bar is the one thing in this frame that changes with who is looking: somebody
 * who is already signed in is offered the studio rather than an account. So the
 * session's provider is mounted here and read under it in the header — and only
 * when there is a pool to read one from, because `AuthProvider` with no config
 * answers with its "sign-in is not configured" screen, which is the right answer
 * for the studio and would take the whole public site offline. A site with no pool
 * still has to render: its content has a seed fallback for exactly that.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: `${settings.title} — ${settings.tagline}`,
      template: `%s — ${settings.title}`,
    },
    description: settings.description,
    applicationName: settings.title,
    openGraph: {
      type: 'website',
      siteName: settings.title,
      title: `${settings.title} — ${settings.tagline}`,
      description: settings.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${settings.title} — ${settings.tagline}`,
      description: settings.description,
    },
  };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();
  // The callback path is the studio's, from the route table, because that is the
  // URL the Cognito client has registered — this provider only reads a session,
  // but a bar that later offers a Google sign-in would send the browser back to
  // whatever this said, and `/auth/callback` is not a page this app has.
  const config = authConfigFromEnv({ callbackPath: routes.authCallback() });

  return (
    <ThemeProvider>
      {/* The column that used to be the `<body>`, which the root layout owns now
          and which the studio renders into as well. */}
      <div className="flex min-h-dvh flex-col">
        {/* Wrapped rather than conditionally rendered from the inside: the bar is
            a server component, and which pair of buttons it draws is the one thing
            it cannot work out for itself. */}
        {config ? (
          <AuthProvider config={config}>
            <SiteHeader primaryCta={settings.primaryCta} withSession />
          </AuthProvider>
        ) : (
          <SiteHeader primaryCta={settings.primaryCta} />
        )}
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
