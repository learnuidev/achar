/**
 * What Cognito's answers mean, in sentences.
 *
 * Two jobs in one file because they are the same job: a code that reaches a
 * person is a bug in the interface. `stepSentence` covers a sign-in that needs
 * another step — an MFA code, a password change, an unconfirmed account — and
 * `messageOf` covers a failure, where the provider's own sentence is usually the
 * best one available and a handful of named errors are worth replacing because
 * the raw text names a policy instead of a fix.
 */

/** The provider's own sentence when there is one, and a plain one when there is not. */
export function messageOf(failure: unknown, fallback: string): string {
  if (failure instanceof Error) {
    const known = NAMED[failure.name];
    if (known) return known;
    if (failure.message) return failure.message;
  }
  return fallback;
}

/**
 * The failures worth saying differently.
 *
 * Everything else is passed through, because Cognito's message for it is more
 * specific than anything here could be. These four are the ones whose raw text
 * names a rule or an exception class rather than what to do next.
 */
const NAMED: Record<string, string> = {
  UsernameExistsException:
    'An account already exists for that address. Sign in instead, or reset the password.',
  CodeMismatchException: 'That confirmation code is not right. Check the email and try again.',
  ExpiredCodeException: 'That code has expired. Send a new one.',
  LimitExceededException: 'Too many attempts just now. Wait a minute and try again.',
  TooManyRequestsException: 'Too many attempts just now. Wait a minute and try again.',
};

/**
 * What a sign-in step means, in a sentence.
 *
 * The codes are Cognito's, and printing the code raw puts a token like
 * `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED` in front of somebody who is trying
 * to get to work. Anything unrecognised is reported as a step rather than
 * guessed at.
 */
export function stepSentence(step: string): string {
  switch (step) {
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'This account needs a new password before it can sign in. Reset it and try again.';
    case 'CONFIRM_SIGN_IN_WITH_TOTP_CODE':
      return 'Enter the code from your authenticator app to finish signing in.';
    case 'CONFIRM_SIGN_IN_WITH_SMS_CODE':
    case 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE':
      return 'A verification code has been sent to you. Enter it to finish signing in.';
    case 'CONFIRM_SIGN_UP':
      return 'This account has not been confirmed yet. Check your email for the confirmation code.';
    case 'RESET_PASSWORD':
      return 'This account has to reset its password before it can sign in.';
    default:
      return `This account needs one more step (${step}) before it can sign in.`;
  }
}
