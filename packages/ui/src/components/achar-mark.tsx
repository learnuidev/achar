import Image from 'next/image';
import logo from '../../assets/logo.png';
import { cn } from '../lib/utils';

/**
 * The wordmark: the Achar flame, then the name.
 *
 * The flame is the product's own logo rather than a glyph drawn in CSS, and it
 * travels with this package as an asset so that every screen — the site's header
 * and footer, the studio's rail, the sign-in card — draws the same one. It is
 * sized by height, because the mark is taller than it is wide and a square box
 * would either squash it or leave it floating in space.
 *
 * The name stays in the text colour, so it reads as a name rather than as a
 * link, and the flame carries no accessible text of its own: the word beside it
 * is what a screen reader should say, and a mark announced twice is a mark that
 * sounds like a stutter.
 *
 * `className` goes on the whole mark, so a header can size the space around it
 * and a footer can dim it without either of them rebuilding it.
 */
export function AcharMark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src={logo}
        alt=""
        aria-hidden="true"
        width={logo.width}
        height={logo.height}
        className="h-8 w-auto shrink-0"
      />
      <span className="text-base font-semibold tracking-tight text-foreground">Achar</span>
    </span>
  );
}
