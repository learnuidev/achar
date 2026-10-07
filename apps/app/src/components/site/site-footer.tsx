import Link from 'next/link';
import { AcharMark, Separator } from '@achar/ui';

/**
 * The footer: five columns, the wordmark, and a bottom bar.
 *
 * The Product and Platform links are anchors into the sections the product page
 * is actually built from. The Company and Legal columns are the other kind of
 * route this site has: `page` documents, served by `[slug]`. That is the point of
 * a footer on a CMS-driven site — a company that writes an About page in the
 * studio gets a footer link by saving a document, and this file does not change.
 */
const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Overview', href: '/product' },
      { label: 'The content lake', href: '/product#lake' },
      { label: 'GROQ', href: '/product#groq' },
      { label: 'The studio', href: '/product#studio' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { label: 'Real-time collaboration', href: '/product#realtime' },
      { label: 'Content delivery', href: '/product#cdn' },
      { label: 'Integrations', href: '/product#integrations' },
      { label: 'Pricing', href: '/pricing' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Customer stories', href: '/customers' },
      { label: 'Questions', href: '/pricing#faq' },
      { label: 'Plans compared', href: '/pricing#compare' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Careers', href: '/careers' },
      { label: 'Contact', href: '/contact' },
      { label: 'Security', href: '/security' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Sub-processors', href: '/sub-processors' },
      { label: 'Status', href: '/status' },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-muted/30">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-6">
          <div className="flex flex-col gap-3 lg:col-span-1">
            <Link href="/" aria-label="Achar, home">
              <AcharMark />
            </Link>
            <p className="text-sm text-muted-foreground">
              The Content Operating System. Content as data, authored once and delivered anywhere.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title} className="flex flex-col gap-3">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {column.title}
              </h2>
              <ul className="flex flex-col gap-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Achar. Built on structured content.</p>
          <p>
            This site is rendered from the same dataset it sells — the pages you are reading are
            documents in an Achar project.
          </p>
        </div>
      </div>
    </footer>
  );
}
