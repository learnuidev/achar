'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/**
 * Light and dark, decided on the client.
 *
 * Dark by default and following the system when the visitor has said so: this is
 * a product page whose screenshots are dark, and a first visit that flashes white
 * before the theme is read out of storage is the worst of the three options.
 * `attribute="class"` because that is what `globals.css` keys on — `.dark` holds
 * the second set of tokens, and the two themes are otherwise the same page.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
