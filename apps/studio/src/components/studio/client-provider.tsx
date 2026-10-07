'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AcharClient } from '@achar/api';
import { useViewer } from '@achar/auth';
import { Skeleton } from '@achar/ui';

/**
 * The one `AcharClient` the studio uses, handed down.
 *
 * One rather than one per request, for two reasons. The token is the first: a
 * client is built from a bearer token, `getToken()` is asynchronous, and a
 * hook that reached for the token itself would have to re-answer the question
 * "which token" on every fetch, at slightly different times. The second is that
 * the client *is* the identity of the request — rebuilding it is how a fresh
 * token takes effect, so there is exactly one place where that happens.
 *
 * Children are held back until the client exists rather than being given a
 * nullable one, because every screen under here fetches immediately: a page
 * that has to handle "no client yet" on top of "no data yet" is a page with a
 * branch nobody ever test-walks.
 */
const AcharClientContext = createContext<AcharClient | null>(null);

export function AcharClientProvider({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  const { viewer, getToken } = useViewer();
  const [client, setClient] = useState<AcharClient | null>(null);

  // The viewer's id rather than the viewer object: the object is rebuilt by the
  // auth provider on every render, and depending on it would rebuild the client
  // — and so refetch everything below — forever.
  const viewerId = viewer?.userId ?? null;

  useEffect(() => {
    let cancelled = false;

    async function build() {
      let token: string | null = null;
      try {
        token = await getToken();
      } catch {
        // A token that cannot be read is no worse than none: the request below
        // fails with the API's own 401, which names the actual problem.
        token = null;
      }
      if (cancelled) return;
      setClient(new AcharClient({ apiUrl, token }));
    }

    void build();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `getToken` is a fresh closure each render; the viewer is what changes.
  }, [apiUrl, viewerId]);

  if (!client) {
    return (
      <div className="flex h-svh items-center justify-center bg-background">
        <Skeleton className="h-10 w-56 rounded-lg" />
      </div>
    );
  }

  return <AcharClientContext.Provider value={client}>{children}</AcharClientContext.Provider>;
}

export function useAcharClient(): AcharClient {
  const client = useContext(AcharClientContext);
  if (!client) {
    throw new Error('useAcharClient must be used inside <AcharClientProvider>');
  }
  return client;
}
