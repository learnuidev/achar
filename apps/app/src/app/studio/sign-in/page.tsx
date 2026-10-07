import { SignInFrame } from '@/components/studio/auth-gate';

/**
 * Signing in, as a page.
 *
 * The gate draws the same screen *over* whatever somebody tried to open; this
 * route exists for the links that point at signing in rather than at a screen, and
 * what it renders is the gate's own frame. There is nothing else for it to do: the
 * frame reads the session itself, so somebody who is already signed in gets the way
 * out of here rather than a form they do not need.
 */
export default function SignInPage() {
  return <SignInFrame />;
}
