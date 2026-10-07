'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the browser is up yet.
 *
 * False on the server and on the first render in the browser, true from the next
 * one — which is what a component that cannot know something until it is running
 * needs in order to render the same markup twice and then render the truth. The
 * alternative, reading `window` during render, is a hydration mismatch that looks
 * like a flicker and reports as an error.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
