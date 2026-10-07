import type { Metadata } from 'next';
import { Toaster } from '@achar/ui';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeProvider } from '@/components/site/theme-provider';
import { getSiteSettings } from '@/content';
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
 * Nothing here is dynamic on purpose. `params` and `searchParams` are the page's
 * business, and the only thing the frame needs from a request is nothing at all.
 *
 * The metadata is generated here rather than in the root layout for the same
 * reason the chrome lives here: the studio's title is its own, and a marketing
 * site's tagline is not a fact about a schema editor.
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

  return (
    <ThemeProvider>
      {/* The column that used to be the `<body>`, which the root layout owns now
          and which the studio renders into as well. */}
      <div className="flex min-h-dvh flex-col">
        <SiteHeader primaryCta={settings.primaryCta} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
