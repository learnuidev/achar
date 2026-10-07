import { AcharMark, Card, CardContent, Skeleton } from '@achar/ui';
import { SiteHeader } from '@/components/site/site-header';

/**
 * The frame every account screen wears: the site's bar, the wordmark, a heading,
 * and a card.
 *
 * Signing in happens on more than one screen — `/sign-in`, `/sign-up`, the
 * studio's own `/studio/sign-in`, the copy of it the gate draws over whatever
 * somebody tried to open, the OAuth callback, and onboarding's first step — and
 * they are one screen with different words rather than six. What they share is
 * this composition: the site's own bar across the top, so that somebody who
 * followed a link to a form they cannot fill in can go and read what the product is
 * instead of reaching for the back button; the mark under it, because the next
 * thing they should be able to read is which product is asking; a heading that says
 * which door this is; the form in a card; and the links out underneath, for somebody
 * who came to the wrong one.
 *
 * The bar is `SiteHeader`, the site's, rather than a bar of its own — one bar has
 * one set of links in it, and its buttons already know what to say to somebody who
 * is signed in. `withSession` is true because every surface that draws this frame
 * mounts `AuthProvider` above it: they are all screens about a session, which is
 * the one thing the pair of buttons has to know.
 *
 * It lives in the app rather than in `@achar/auth` because the mark is the design
 * system's, and a package that drew the screen around the form would have to
 * depend on the system the signed-in product draws with — the package keeps what
 * is Cognito's business and the fields, and this keeps the frame around it. The
 * forms are the bodies of this card, which is why the card itself is here: a form
 * that drew its own would be a second frame the first one had to fit inside.
 *
 * `title` is the screen's one `h1`, and it is left off only where the body brings
 * its own heading — the callback, whose words depend on an answer that has not
 * arrived yet.
 */
export function AuthFrame({
  title,
  description,
  children,
  footer,
}: {
  title?: string;
  description?: React.ReactNode;
  /** The form, inside the card: the auth package's `SignIn`, `SignUp` or `OAuthCallback`. */
  children: React.ReactNode;
  /** The links out, under the card — where somebody goes if this is the wrong door. */
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <SiteHeader withSession />

      <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-md flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <AcharMark className="h-9" />
            {title || description ? (
              <div className="space-y-1">
                {title ? <h1 className="text-xl font-semibold tracking-tight">{title}</h1> : null}
                {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
              </div>
            ) : null}
          </div>

          {/* `pt-6` because `CardContent` drops the top padding for a card that has a
              header above it, and this one never does. */}
          <Card className="w-full">
            <CardContent className="pt-6">{children}</CardContent>
          </Card>

          {footer ? (
            <div className="text-center text-sm text-muted-foreground">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * The frame before anything is known: the mark, and the shape of what is coming.
 *
 * The studio's gate and the onboarding flow each spend a moment reading the
 * session, and each drew this itself — the same mark over the same two grey blocks,
 * at two heights. One screen waiting for an answer is one thing to keep in step, so
 * it is drawn once, here, at the size of the frame it stands in for.
 *
 * Deliberately without the bar, unlike the frame: this covers the moment whose
 * answer decides *which* chrome is drawn — the account frame, the studio's shell or
 * the flow's own bar — and a bar that turned into a different bar is worse than a
 * mark that turns into a screen.
 */
export function AuthFrameSkeleton() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background">
      <div className="flex w-full max-w-md flex-col items-center gap-4 px-6">
        <AcharMark className="h-9" />
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    </div>
  );
}
