'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * The token every "Try it" on the page calls with.
 *
 * One token for the whole reference rather than one per endpoint: a reader who
 * pastes one means it for the page, and a page that asked again at every section
 * would be ten prompts for one fact.
 *
 * Held in `sessionStorage`, so a reload does not lose it and closing the tab does.
 * A token in the browser is a credential in a place JavaScript can read, and the
 * alternative — `localStorage` — would outlive the tab and sit in a shared
 * machine's profile indefinitely. "This tab" is the shortest honest lifetime that
 * still survives a refresh, and the panel says so rather than leaving somebody to
 * wonder.
 */
const STORAGE_KEY = 'achar.docs.token';

/** What is remembered about a token between reloads: the secret, and what it is. */
interface StoredCredential {
  token: string;
  tokenId?: string;
  projectId?: string;
  name?: string;
}

export interface Credential {
  token: string;
  /** What the panel shows instead of the secret: enough to recognize, not enough to use. */
  label: string;
  /**
   * The token's own id and project, when it was minted here.
   *
   * Kept so that the panel can offer to **revoke** what it made, including after a
   * reload: the id is what `DELETE /v1/projects/{p}/tokens/{tokenId}` takes, and a
   * secret in this tab with no way to take it back would be a worse deal than the
   * paste box it replaced.
   */
  tokenId?: string;
  projectId?: string;
  name?: string;
}

interface PlaygroundContextValue {
  credential: Credential | null;
  /** False until the store has been read, so the UI does not flash "no token". */
  ready: boolean;
  useToken: (token: string, about?: Omit<Credential, 'token' | 'label'>) => void;
  forget: () => void;
}

const PlaygroundContext = createContext<PlaygroundContextValue | null>(null);

/** `achar_01JQ8Z…_9f2c41…` as the panel shows it: the id, and that a secret is there. */
export function labelOf(token: string): string {
  const [prefix, id] = token.split('_');
  if (!prefix || !id) return `${token.slice(0, 6)}…`;
  return `${prefix}_${id}…`;
}

export function PlaygroundProvider({ children }: { children: React.ReactNode }) {
  const [credential, setCredential] = useState<Credential | null>(null);
  const [ready, setReady] = useState(false);

  /** The token in play, so an answer about a token that has been replaced cannot win. */
  const live = useRef<string | null>(null);

  const useToken = useCallback(
    (raw: string, about: Omit<Credential, 'token' | 'label'> = {}) => {
      const token = raw.trim();
      if (!token) return;
      live.current = token;

      const next: Credential = { token, label: labelOf(token), ...about };
      setCredential(next);

      try {
        const stored: StoredCredential = {
          token,
          ...(about.tokenId ? { tokenId: about.tokenId } : {}),
          ...(about.projectId ? { projectId: about.projectId } : {}),
          ...(about.name ? { name: about.name } : {}),
        };
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
      } catch {
        // Storage being unavailable costs a refresh, not the token.
      }
    },
    [],
  );

  const forget = useCallback(() => {
    live.current = null;
    setCredential(null);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to do: it was never written.
    }
  }, []);

  // Read after mount rather than during render: `sessionStorage` does not exist on
  // the server, and reading it while rendering would make the first paint disagree
  // with the markup the server sent.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as StoredCredential;
        if (stored.token) {
          const { token, tokenId, projectId, name } = stored;
          useToken(token, { ...(tokenId ? { tokenId } : {}), ...(projectId ? { projectId } : {}), ...(name ? { name } : {}) });
        }
      }
    } catch {
      // A store that cannot be read is a store with nothing in it.
    }
    setReady(true);
  }, [useToken]);

  const value = useMemo<PlaygroundContextValue>(
    () => ({ credential, ready, useToken, forget }),
    [credential, ready, useToken, forget],
  );

  return <PlaygroundContext.Provider value={value}>{children}</PlaygroundContext.Provider>;
}

/** The page's token, for anything that runs a request. */
export function usePlayground(): PlaygroundContextValue {
  const value = useContext(PlaygroundContext);
  if (!value) {
    throw new Error('usePlayground must be used inside a PlaygroundProvider');
  }
  return value;
}
