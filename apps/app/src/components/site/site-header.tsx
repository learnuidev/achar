import Link from 'next/link';
import { AcharMark, Button, ThemeToggle } from '@achar/ui';
import { SiteNav } from '@/components/site/site-nav';
import type { Cta } from '@/content/types';

/**
 * The bar at the top of every page.
 *
 * Translucent and sticky, so the page scrolls under it rather than past it: the
 * front door of a product like this is read by scrolling, and a bar that
 * disappears takes the one call to action with it.
 *
 * The primary action is the `siteSettings` document's own `primaryCta`, passed in
 * from the layout, which is why this takes a prop rather than hard-coding a
 * label — the button in the header and the button in the hero are the same
 * sentence, and it is edited in one place.
 *
 * "Sign in" beside it is the one link here that is not content, and it is not a
 * call to action either: nobody is persuaded by it. It is there because the
 * button is the way in for somebody who has no account, and a bar with only that
 * button leaves the person who already has one — the person most likely to be
 * looking at this site — with no visible door.
 */
export function SiteHeader({ primaryCta }: { primaryCta?: Cta }) {
  const cta = primaryCta ?? { label: 'Start building', href: '/product' };

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
        {/* The mark carries the name, so nothing here repeats it — `AcharMark` is
            the wordmark, and it is not content: a brand is not a document field. */}
        <Link href="/" aria-label="Achar, home">
          <AcharMark />
        </Link>

        <SiteNav />

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/sign-in"
            className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            Sign in
          </Link>
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href={cta.href}>{cta.label}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
