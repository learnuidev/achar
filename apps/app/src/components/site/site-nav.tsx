'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { MenuIcon } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  cn,
} from '@achar/ui';

/**
 * The site's navigation, in one place.
 *
 * The destinations are the things a visitor is deciding between — what it is, how
 * to build on it, what it costs, who uses it, and what we think — and they are
 * listed here rather than in the header because the mobile panel needs the same
 * list in the same order, and two lists drift.
 */
export const NAV_LINKS = [
  { href: '/product', label: 'Product' },
  { href: '/docs', label: 'Docs' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/customers', label: 'Customers' },
  { href: '/blog', label: 'Blog' },
] as const;

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            aria-current={isCurrent(pathname, link.href) ? 'page' : undefined}
            className={cn(
              'transition-colors hover:text-foreground',
              isCurrent(pathname, link.href) ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <MenuIcon />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Achar</DialogTitle>
            <DialogDescription>Where to go next.</DialogDescription>
          </DialogHeader>
          <nav aria-label="Main" className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Whether a link is the page being read.
 *
 * A prefix match rather than equality, so `/blog/a-post` still lights up Blog —
 * a nav that goes blank one level down is a nav that stops telling somebody where
 * they are.
 */
function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
