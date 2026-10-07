import { cn } from '@achar/ui';

import { CopyButton } from '@/components/ui/copy-row';

/**
 * A block of code, with the thing that makes it useful: a way to take it away.
 *
 * A reference is read by somebody who is about to paste one of these, so every
 * block is copyable rather than selectable. The label above the block says what it
 * is — the status it answered with, or `cURL` — because two unlabelled JSON blocks
 * in a row are a puzzle.
 *
 * `min-w-0` on the figure and the `<pre>` are what keep a long command from taking
 * the page's width with it: a block of code is the widest thing on a page like this
 * by definition, and a flex or grid item is sized by its content's minimum unless
 * it is told otherwise. Without them one long line makes the whole page scroll
 * sideways instead of the line scrolling inside its own box.
 */
export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  return (
    <figure className={cn('min-w-0 overflow-hidden rounded-lg border border-border', className)}>
      <figcaption className="flex items-center justify-between gap-3 border-b border-border bg-muted/60 px-3 py-1">
        <span className="truncate font-mono text-xs text-muted-foreground">{label}</span>
        <CopyButton value={code} label={label ?? 'Copy'} className="size-7" />
      </figcaption>
      <pre className="min-w-0 overflow-x-auto bg-muted/30 px-4 py-3 font-mono text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
