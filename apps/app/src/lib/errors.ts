/**
 * What to put on screen when a request fails.
 *
 * The API answers every failure as an `ApiErrorBody`, and `AcharApiError`
 * carries it, so the message is already written for a person — "dataset not
 * found", "you need the editor role". A stack trace is for whoever is fixing
 * the API, and they have CloudWatch; the studio shows the sentence.
 */

import type { ApiErrorBody } from '@achar/types';

/** True for the error `@achar/api` throws, without importing its class into every caller. */
export function isAcharApiError(error: unknown): error is Error & { status: number; body?: ApiErrorBody } {
  return (
    error instanceof Error &&
    typeof (error as { status?: unknown }).status === 'number' &&
    'name' in error &&
    error.name === 'AcharApiError'
  );
}

/** The sentence to show. Never a stack, never empty. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}

/** The status, when there is one — a 403 and a 404 are different screens. */
export function errorStatus(error: unknown): number | null {
  return isAcharApiError(error) ? error.status : null;
}

/** True when the failure is a permissions one, which reads differently from a breakage. */
export function isForbidden(error: unknown): boolean {
  return errorStatus(error) === 403;
}
