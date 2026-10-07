'use client';

import { OAuthCallback } from '@achar/auth';
import { AcharMark, Card, CardContent } from '@achar/ui';

/**
 * Where the Hosted UI sends the browser back to.
 *
 * The exchange — code for tokens — is `@achar/auth`'s business, and this route
 * exists so that it has somewhere to land that is inside the studio's frame.
 * The alternative, a bare callback route, is a flash of unstyled white between
 * Google and the studio.
 */
export default function AuthCallbackPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-6 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <AcharMark className="h-9" />
        <Card className="w-full">
          <CardContent className="pt-6">
            <OAuthCallback />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
