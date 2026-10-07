import * as React from 'react';

import { cn } from '../../lib/utils';

/**
 * A field for prose.
 *
 * `field-sizing-content` where the browser has it, so a textarea grows with what
 * is typed into it rather than scrolling inside three lines — and `min-h-20`
 * where it does not, which is the honest fallback for a control whose height is
 * otherwise the developer's guess at how much somebody will write.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 field-sizing-content',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export { Textarea };
