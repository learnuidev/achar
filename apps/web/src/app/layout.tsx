import type { Metadata } from 'next';
import { Toaster } from '@achar/ui';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeProvider } from '@/components/site/theme-provider';
import { getSiteSettings } from '@/content';
import { siteUrl } from '@/lib/site';

import './globals.css';

/**
 * The frame: the theme, the bar, the page, the footer.
 *
 * The metadata comes from the `siteSettings` document rather than from a constant
 * in this file, which is the same decision the rest of the site makes — the title
 * of the site is content, and the person who renames the product should not be
 * opening a pull request to do it.
 *
 * Nothing here is dynamic on purpose. `params` and `searchParams` are the page's
 * business, and the only thing the frame needs from a request is nothing at all.
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await getSiteSettings();

  return (
    // `suppressHydrationWarning` because `next-themes` writes the resolved theme
    // onto this element before React hydrates, which is the difference between a
    // page that starts dark and a page that flashes white first.
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <ThemeProvider>
          <SiteHeader primaryCta={settings.primaryCta} />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
