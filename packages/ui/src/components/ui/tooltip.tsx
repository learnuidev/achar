'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '../../lib/utils';

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/**
 * The provider, mounted once near the root of an app.
 *
 * Radix needs it above every tooltip and refuses to render without one, so this
 * is a required part of the wiring rather than an optional nicety — and it is
 * where the shared `delayDuration` lives: a strip of icon buttons whose captions
 * each waited their own moment reads as a delay per button rather than as one
 * interface, and `skipDelayDuration` is what makes the second one instant.
 */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

/**
 * The caption itself, drawn inverted.
 *
 * `bg-foreground` on `text-background` rather than a muted panel: a tooltip has
 * to read as something laid over the page rather than as another panel in it, and
 * inverting the pair does that in both themes with no second token to keep in
 * step. The slide comes from the side Radix resolved, so it moves out of the edge
 * it was placed against.
 */
const TooltipContent = React.forwardRef<
  React.ComponentRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent };
