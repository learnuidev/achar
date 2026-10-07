'use client';

import { createContext, useContext } from 'react';
import type { Viewer } from '@achar/types';

import type { AcharAuthConfig } from './config';

/** What a signed-in app reads about who is looking. */
export interface AuthContextValue {
  viewer: Viewer | null;
  loading: boolean;
  signedIn: boolean;
  signOut: () => Promise<void>;
  getToken: () => Promise<string | null>;
  /** Re-reads the session. What a sign-in screen calls once it has signed somebody in. */
  refresh: () => Promise<Viewer | null>;
  /** The config this provider was given, for the parts of the package that need it. */
  config: AcharAuthConfig;
}

/**
 * The session, shared by everything under one `AuthProvider`.
 *
 * It lives here rather than in the provider module because two other modules read
 * it — the hooks an app uses, and the two components that perform a sign-in — and
 * a provider that exported its own context would make those imports circular.
 *
 * It is deliberately not exported from the package: `useViewer` is the shape apps
 * are promised, and a context anybody could read is a second, unversioned API.
 */
export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * The context, or a thrown sentence.
 *
 * Throwing rather than answering with an empty session: a hook used outside its
 * provider is a wiring mistake, and a hook that quietly reported "nobody is
 * signed in" would turn that mistake into a screen that renders as signed out —
 * which is indistinguishable from a real session problem and much harder to find.
 */
export function useAuthContext(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('This hook is used outside an <AuthProvider>. Wrap the tree in one.');
  }
  return value;
}
