import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * A placeholder with the shape of what is coming.
 *
 * `pulse` rather than a shimmer: a loading list of nine skeletons all sliding a
 * gradient at once is the busier thing on the screen, and the point of a skeleton
 * is to hold a layout still while something loads. Marked hidden from assistive
 * technology — the loading state it stands for is announced by whatever wraps it.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
