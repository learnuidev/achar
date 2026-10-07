import Link from 'next/link';

import { API_ENDPOINT_GROUPS } from '@/lib/api-reference';

/**
 * The rail: everything on the page, in the order it is on the page.
 *
 * Endpoints are labelled by their method and path rather than by their sentence,
 * because somebody who has come back to look one thing up knows the path and not
 * the wording — and a list of thirty summaries reads as thirty paragraphs while a
 * list of thirty paths reads as a table of contents.
 *
 * Plain anchors, deliberately: a scroll-spy would have to run on the client and
 * watch thirty sections to colour one link, and a reference is not a place you
 * navigate around — you arrive from a token you just made, read the section you
 * came for, and go back to your terminal.
 */
export function DocsRail() {
  return (
    <aside className="hidden w-64 shrink-0 lg:block">
      <nav
        aria-label="On this page"
        className="sticky top-20 max-h-[calc(100svh-6rem)] overflow-y-auto py-2"
      >
        <ul className="grid gap-0.5">
          <RailLink href="#overview">Overview</RailLink>
          <RailLink href="#try-it">Try it here</RailLink>
          <RailLink href="#authentication">Authentication</RailLink>
          <RailLink href="#query-language">The query language</RailLink>
        </ul>

        {API_ENDPOINT_GROUPS.map((group) => (
          <div key={group.id} className="mt-5 grid gap-0.5">
            <Link
              href={`#${group.id}`}
              className="rounded-full px-3 py-1 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              {group.title}
            </Link>
            <ul className="grid gap-0.5">
              {group.endpoints.map((endpoint) => (
                <li key={endpoint.id}>
                  <Link
                    href={`#${endpoint.id}`}
                    className="block truncate rounded-full px-3 py-1.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {endpoint.method} {endpoint.path}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <ul className="mt-5 grid gap-0.5">
          <RailLink href="#errors">Errors</RailLink>
          <RailLink href="#conventions">Conventions</RailLink>
        </ul>
      </nav>
    </aside>
  );
}

function RailLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="block rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}
