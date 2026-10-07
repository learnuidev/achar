import type { ReactNode } from 'react';
import { cn } from '@achar/ui';

/**
 * Nothing here yet, and what to do about it.
 *
 * The description is the part that matters: an empty list in a studio is
 * usually the first thing somebody sees after connecting an environment, and
 * "no documents" answers a question nobody asked. The empty states in this app
 * say what the thing is and which button makes one.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted px-6 py-10 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex size-10 items-center justify-center rounded-lg bg-card text-muted-foreground">
          {icon}
        </div>
      )}
      <div className="max-w-md space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** A read that failed, said in the API's own words. */
export function ErrorNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive',
        className,
      )}
    >
      {children}
    </p>
  );
}

/**
 * A note that the caller may look but not touch.
 *
 * Drawn as a line rather than as a disabled control per action: a viewer seeing
 * every button greyed out learns the app is broken, and one line at the top of
 * the screen tells them the actual rule.
 */
export function ReadOnlyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}
