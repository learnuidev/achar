import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Button, Toaster } from '@achar/ui';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';
import { ThemeProvider } from '@/components/site/theme-provider';
import { getSiteSettings } from '@/content';

/**
 * A 404 in the site's own voice, and inside the site's own frame.
 *
 * The one page a visitor reaches by being wrong about something, so it says what
 * happened in the register the rest of the site uses rather than in the register
 * a router does, and it offers the four places somebody was probably heading.
 * Next renders this for `notFound()` as well as for an unmatched path, which is
 * why it reads as an answer rather than as a stack trace.
 *
 * **The frame is drawn here rather than inherited**, which is the one thing about
 * this file that is not obvious. A not-found boundary is resolved against the
 * root rather than against the route group it sits in: `(site)` adds no segment,
 * so Next reaches this component from above `(site)/layout.tsx` and renders it
 * without that layout's header, footer and theme provider. A 404 that had lost the
 * site's chrome was the first thing to break when the site and the studio became
 * one app, and a page that draws its own frame is the fix that does not depend on
 * how a framework resolves a boundary.
 */
export default async function NotFound() {
  const settings = await getSiteSettings();

  const destinations = [
    { href: '/product', label: 'Product', note: 'The lake, GROQ, the studio and delivery' },
    { href: '/pricing', label: 'Pricing', note: 'Four plans and what is in each' },
    { href: '/customers', label: 'Customers', note: 'Six teams and their numbers' },
    { href: '/blog', label: 'Blog', note: 'Notes on content modelling' },
  ];

  return (
    <ThemeProvider>
      <div className="flex min-h-dvh flex-col">
        <SiteHeader primaryCta={settings.primaryCta} />

        <main className="flex-1">
          <section className="border-b border-border/60">
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 sm:py-32">
              <div className="max-w-2xl">
                <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                  404
                </p>
                <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                  Nothing is published at this address.
                </h1>
                <p className="mt-6 text-lg text-muted-foreground">
                  Which is an honest answer rather than a broken one: this site renders documents, and
                  there is no document whose slug is the path you asked for. If somebody gave you this
                  link, the document behind it may have been unpublished since — a draft is a row of
                  its own here, so taking something off the site does not delete it.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Button asChild size="lg">
                    <Link href="/">
                      Back to the front page
                      <ArrowRightIcon />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="ghost">
                    <Link href="/blog">Read the blog</Link>
                  </Button>
                </div>
              </div>

              <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {destinations.map((destination) => (
                  <Link
                    key={destination.href}
                    href={destination.href}
                    className="rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
                  >
                    <span className="block font-medium">{destination.label}</span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {destination.note}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        </main>

        <SiteFooter />
      </div>
      <Toaster />
    </ThemeProvider>
  );
}
