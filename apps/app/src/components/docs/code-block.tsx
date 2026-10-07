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
 * **The code wraps; it does not scroll sideways.** A block of code is the widest
 * thing on a page like this by definition — a `curl` carrying a query string, a JSON
 * body on one line — and the conventional answer is a horizontal scrollbar inside
 * the box. That is an answer for an editor somebody is typing in, not for a
 * reference being read: eighty of these down one page is eighty sideways scrollers,
 * each hiding the end of the line the reader came for.
 *
 * `whitespace-pre-wrap` keeps the author's newlines and adds wrapping; `wrap-anywhere`
 * is what breaks a token that has no break opportunity in it — a signed URL, a
 * secret — and it also stops the box from being sized by that token, which is what
 * made it overflow the page in the first place. `min-w-0` on the figure and the
 * `<pre>` is the same guard for a flex or grid parent.
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
      <pre className="min-w-0 bg-muted/30 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap wrap-anywhere">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
