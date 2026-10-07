import type { Metadata } from 'next';
import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { apiUrlFromEnv } from '@/lib/env';

/**
 * `/get-started` — the first project, and the first dataset inside it.
 *
 * The URL is where a person with nothing to open is sent, and where they come back
 * to after signing in; the flow itself is `onboarding-flow.tsx`, which is a client
 * component because every question on it is about a session and ends in a request.
 * The API URL is read here, on the server, and handed down — the same arrangement
 * the studio's layout makes, and for the same reason: the environment a deployment
 * is pointed at is a runtime fact.
 */
export const metadata: Metadata = {
  title: 'Get started — Achar',
  description: 'Make your first project, and the dataset your content will live in.',
  // Nothing here is worth finding by search: it is a screen for one person who has
  // already signed in, and an indexed "what are you building?" helps nobody.
  robots: { index: false, follow: false },
};

export default function GetStartedPage() {
  return <OnboardingFlow apiUrl={apiUrlFromEnv()} />;
}
