import { cn } from '../lib/utils';

/**
 * How wide each line of the glyph is.
 *
 * The three rows are deliberately unequal: equal bars are a hamburger menu, and
 * a menu is the one thing this mark must not read as on a page whose header has
 * one. Unequal lines of text are a document.
 */
const LINES = ['w-4', 'w-3.5', 'w-2.5'];

/**
 * The wordmark: a small structured-content glyph, then the name.
 *
 * Abstract rather than literal — three bulleted lines inside a tile, which is a
 * document outline at 32 pixels — because a mark that has to be explained is a
 * mark that will be redrawn. The tile is the primary colour for the same reason
 * the buttons are: it is the one warm thing on the page, and the name beside it
 * stays in the text colour so it reads as a name rather than as a link.
 *
 * `className` goes on the whole mark, so a header can size the space around it
 * and a footer can dim it without either of them rebuilding it.
 */
export function AcharMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary"
      >
        <span className="flex flex-col gap-1">
          {LINES.map((width) => (
            <span key={width} className="flex items-center gap-1">
              <span className="size-1 rounded-full bg-primary-foreground/70" />
              <span className={cn('h-1 rounded-full bg-primary-foreground', width)} />
            </span>
          ))}
        </span>
      </span>
      <span className="text-base font-semibold tracking-tight text-foreground">Achar</span>
    </span>
  );
}
