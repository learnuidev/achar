'use client';

import { OAuthCallback } from '@achar/auth';
import { AuthFrame } from '@/components/auth/auth-frame';

/**
 * Where the Hosted UI sends the browser back to.
 *
 * The exchange — code for tokens — is `@achar/auth`'s business, and this route
 * exists so that it has somewhere to land that is inside the studio's frame.
 * The alternative, a bare callback route, is a flash of unstyled white between
 * Google and the studio.
 *
 * The frame is the one every account screen wears, without a heading of its own:
 * which heading this screen has — "finishing" or "did not finish" — is decided by
 * the answer it is waiting for, so the body brings it.
 */
export default function AuthCallbackPage() {
  return (
    <AuthFrame>
      <OAuthCallback />
    </AuthFrame>
  );
}
