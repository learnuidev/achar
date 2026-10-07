'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '../lib/utils';

/**
 * A block that arrives as it is scrolled to.
 *
 * A long page read top to bottom benefits from the next thing not being fully
 * there until somebody reaches it: each block lifts a few pixels and settles. It
 * is the page's entire animation budget — one gesture, repeated — so nothing
 * moves in a way that competes with the words.
 *
 * Three refusals, each of which is a way this could go wrong:
 *
 * - **Nothing is hidden until the browser can reveal it.** The server renders
 *   every block visible and this only ever hides one after it has mounted, so a
 *   page with no JavaScript, or with a hydration that never finishes, is a page
 *   rather than a blank space.
 * - **Anything already on screen stays there.** A block in the first paint has
 *   been read by the time the observer would have run, and fading it in afterwards
 *   makes the page look like it is still loading.
 * - **Less motion means no motion.** A system that asked for less gets the
 *   finished page, immediately, with no transition to disable.
 */
export function Reveal({
  children,
  className,
  /** Kept short: this staggers a row of cards, it does not perform. */
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** Whether this block is still waiting to be scrolled to. */
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // On screen already: it was in the first paint, and it should not be animated
    // away from it now that the browser is awake.
    if (element.getBoundingClientRect().top < window.innerHeight * 0.85) return;

    setWaiting(true);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setWaiting(false);
        observer.disconnect();
      },
      // A tenth of the viewport early, so the block has settled by the time its
      // top edge is comfortably in view rather than moving as it is read.
      { rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        'transition-all duration-700 ease-out motion-reduce:transition-none',
        waiting && 'translate-y-4 opacity-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
