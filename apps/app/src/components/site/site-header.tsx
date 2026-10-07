import Link from 'next/link';
import { AcharMark } from '@achar/ui';
import { SignedOutActions, SiteActions } from '@/components/site/site-actions';
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
 * looking at this site — with no visible door. That person is what `withSession`
 * is about: their door is the studio, and both the link and the content button
 * get out of its way. See `site-actions.tsx`.
 *
 * `withSession` is the layout saying that a user pool is configured and that
 * `<AuthProvider>` is therefore mounted above this bar. It is a prop rather than a
 * hook because this is a server component and a hook cannot be called in a branch
 * — and it is the layout's to answer, because the layout is what reads the
 * environment.
 */
export function SiteHeader({
  primaryCta,
  withSession = false,
}: {
  primaryCta?: Cta;
  /** True when there is a session to read, so the bar can draw the signed-in pair. */
  withSession?: boolean;
}) {
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
          {withSession ? <SiteActions cta={cta} /> : <SignedOutActions cta={cta} />}
        </div>
      </div>
    </header>
  );
}
