'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AcharClient } from '@achar/api';
import { errorMessage } from '@/lib/errors';
import { useAcharClient } from '@/components/client-provider';

/**
 * One read, and the four things a screen says about it.
 *
 * Every hook in `src/hooks` is this function with a request plugged in, which
 * is the point: `data`, `error`, `loading` and `refresh` are the whole of what
 * a page needs to draw, and a page that had to assemble them itself would
 * assemble them differently on each one.
 *
 * `key` is the identity of the read — the project, the dataset, the type, the
 * filters. Change it and the request runs again; leave it and nothing moves.
 * The loader is held in a ref so that passing a fresh closure on every render —
 * which is what a caller writing `(client) => client.listProjects()` inline
 * does — does not itself trigger one.
 */
export interface Resource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-run the read, which every write calls afterwards. */
  refresh: () => void;
}

export function useResource<T>(key: string, load: (client: AcharClient) => Promise<T>): Resource<T> {
  const client = useAcharClient();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    loadRef
      .current(client)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(errorMessage(cause, 'Could not load this'));
        setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // The client changes when the token does, which is exactly when a read
    // should run again.
  }, [client, key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, refresh };
}

/**
 * The same state machine for a write.
 *
 * A write is not a resource — nothing is being read that could be stale — but
 * it has the same three states and the same need to say what went wrong, so it
 * is drawn the same way. `run` resolves to the result, or to `null` when it
 * failed, and the caller decides what to do about that: a draft save that fails
 * keeps the draft on screen, and a publish that fails must not.
 */
export interface Action<Args extends unknown[], T> {
  run: (...args: Args) => Promise<T | null>;
  pending: boolean;
  error: string | null;
  reset: () => void;
}

export function useAction<Args extends unknown[], T>(
  act: (client: AcharClient, ...args: Args) => Promise<T>,
): Action<Args, T> {
  const client = useAcharClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actRef = useRef(act);
  actRef.current = act;

  const run = useCallback(
    async (...args: Args): Promise<T | null> => {
      setPending(true);
      setError(null);
      try {
        return await actRef.current(client, ...args);
      } catch (cause: unknown) {
        setError(errorMessage(cause, 'That did not work'));
        return null;
      } finally {
        setPending(false);
      }
    },
    [client],
  );

  const reset = useCallback(() => setError(null), []);

  return { run, pending, error, reset };
}
