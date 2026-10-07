import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'Achar demo — an outside client',
  description:
    'A third-party client of the Achar content API, built the way somebody outside this repository would build one.',
};

/**
 * The demo's shell, and it is deliberately plain.
 *
 * This app is not a surface of the product. It is the *proof* that the content
 * API can be used by somebody who has never seen this repository — which is why
 * it imports `@achar/api` and `@achar/types` and nothing else, has no design
 * system, and owns no component that the studio or the site also uses. The day it
 * shares a component with them is the day it stops demonstrating what an outsider
 * can build.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
