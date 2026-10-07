import logo from '../../assets/logo.png';
import { cn } from '../lib/utils';

/**
 * How much of the mark's own text size the flame is tall.
 *
 * The flame is drawn a little taller than the line of type beside it, the way a
 * mark's cap height sits above a name rather than level with it. Expressing it as
 * a multiple of the font size — rather than as a width by which to pin it — is
 * what keeps the two in proportion in every font size the mark is asked for, and
 * it is why the flame scales with the type when a screen gives the mark a height
 * in `h-*`: the mark's own box is a floor, not a crop.
 */
const FLAME_EM = 1.35;

/**
 * The wordmark: the Achar flame, then the name.
 *
 * The flame is the product's own logo rather than a glyph drawn in CSS, and it
 * travels with this package as an asset so that every screen — the site's header
 * and footer, the studio's rail, the sign-in card — draws the same one.
 *
 * It is a plain `<img>` rather than `next/image`, because next/image is the wrong
 * machine for it: the mark is drawn at 24 to 48 pixels, so there is no candidate
 * width left to choose and no layout to shift, and what the optimizer returns is a
 * re-encoded copy whose quality is decided per request instead of by the file. What
 * this component needs is the pixels that are in the file, at the size the mark is
 * drawn, which is what an image element already does.
 *
 * The asset itself is cropped to the flame, so its own edges are the mark's edges:
 * the width the aspect ratio works out to *is* the flame's width, with no padding
 * smuggled in around it. That is why the height is set once, in one place, and
 * never a height *and* a width: a mark given both is a mark whose aspect ratio is
 * the author's guess rather than the file's, and the guess is what makes a mark
 * look squashed at one size and thin at another.
 *
 * The name stays in the text colour, so it reads as a name rather than as a link,
 * and the flame carries no accessible text of its own: the word beside it is what
 * a screen reader should say, and a mark announced twice is a mark that sounds
 * like a stutter. Both are inline, so the mark still picks up whatever font size
 * and colour the screen around it sets.
 *
 * `name` is for the screens that write "Achar Studio" themselves. There the
 * wordmark is not the brand being drawn twice but the same two words overlapping:
 * the header's own label is a line of text that has to fit inside a row it shares
 * with a project name, and the mark's copy of the name lands on top of it. Asking
 * for the flame alone is the honest answer — the label beside it is the name — and
 * it keeps the name in the one place that screen decided to put it.
 */
export function AcharMark({
  className,
  nameClassName,
  name = true,
}: {
  className?: string;
  /** For the name alone, so a bar can drop it at a width where it does not fit. */
  nameClassName?: string;
  /** False for screens that write the name beside the mark themselves. */
  name?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 leading-none', className)}>
      <img
        src={logo.src}
        alt=""
        aria-hidden="true"
        width={logo.width}
        height={logo.height}
        style={{ height: `${FLAME_EM}em` }}
        className="max-h-full w-auto shrink-0 select-none"
      />
      {name && (
        <span
          className={cn(
            'whitespace-nowrap text-base font-semibold tracking-tight text-foreground',
            nameClassName,
          )}
        >
          Achar
        </span>
      )}
    </span>
  );
}
