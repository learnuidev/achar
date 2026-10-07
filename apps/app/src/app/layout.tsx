import type { Metadata } from 'next';

import './globals.css';
import { siteUrl } from '@/lib/site';

/**
 * The one document both surfaces are rendered into.
 *
 * There are two apps' worth of UI in this directory — the public site at `/` and
 * the studio at `/studio` — and they share exactly this much: an `<html>`, a
 * `<body>`, the stylesheet and the theme class. Everything else is a decision one
 * surface makes and the other must not inherit. The site's header and footer
 * around a schema editor would be nonsense; the studio's sign-in gate around the
 * pricing page would take the site offline.
 *
 * So the chrome lives one level down, in the layout of a surface: `(site)` for
 * the front door, `studio/` for the room the content is written in. A route
 * group is the mechanism because it is the only Next construct that adds a
 * layout without adding a segment to a URL.
 *
 * `suppressHydrationWarning` is on `<html>` because both surfaces' theme
 * providers write the resolved theme onto it before React hydrates, which is the
 * difference between a page that starts dark and a page that flashes white
 * first.
 */
export const metadata: Metadata = {
  // Absolute URLs in metadata, `sitemap.xml` and `robots.txt` all have to name
  // the same origin, and none of them sees the request that produced the page.
  metadataBase: new URL(siteUrl()),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
