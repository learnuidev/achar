'use client';

import { MoonIcon, SunIcon } from 'lucide-react';
import { useTheme } from 'next-themes';

import { useMounted } from '../hooks/use-mounted';
import { Button } from './ui/button';

/**
 * Light or dark, in one press.
 *
 * It toggles between the two rather than offering `system`: the choice this
 * control makes is a personal one, and the preference it is overriding is the
 * one the operating system already expressed — so `system` is where a first-time
 * visitor starts and where the toggle stops being the thing that decides.
 *
 * Which icon is drawn is decided by CSS, so the first paint is already correct
 * for somebody whose system says dark. Only the label waits for the browser,
 * because a label is not something CSS can swap — and the server renders the
 * light-mode one, which is what a page with no system preference gets anyway.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const isDark = resolvedTheme === 'dark';

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label={mounted && isDark ? 'Switch to the light theme' : 'Switch to the dark theme'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      <SunIcon className="size-4 dark:hidden" />
      <MoonIcon className="hidden size-4 dark:block" />
    </Button>
  );
}
