'use client';

import type { Viewer } from '@achar/types';

import { useAuthContext } from '../lib/context';

/** The session, as an app reads it. */
export interface ViewerState {
  viewer: Viewer | null;
  loading: boolean;
  signedIn: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  /**
   * Re-reads the session — what a sign-in screen calls once it has signed
   * somebody in, when the provider's own listener has not fired yet.
   */
  refresh: () => Promise<Viewer | null>;
}

/**
 * The viewer, and what a page does with them.
 *
 * Destructured rather than handed the context whole, so that what this returns is
 * the promise the package makes: the session, and nothing about how it is
 * configured. A page that needs the API URL already has the config it built the
 * provider from.
 */
export function useViewer(): ViewerState {
  const { viewer, loading, signedIn, signOut, getToken, refresh } = useAuthContext();
  return { viewer, loading, signedIn, signOut, getToken, refresh };
}

/** Whether somebody is signed in — the one question a shell asks of the session. */
export function useSignedIn(): boolean {
  return useAuthContext().signedIn;
}
