'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Where a toast appears.
 *
 * Sonner draws its own panels, so this is the one component in the package whose
 * styling is passed as configuration rather than as classes — and the theme has
 * to be handed over rather than inherited, because a toast is rendered in a
 * portal that is not inside the themed tree.
 */
function Toaster({ ...props }: ToasterProps) {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          error: 'group-[.toaster]:text-destructive',
          success: 'group-[.toaster]:text-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
