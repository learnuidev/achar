/**
 * The environment the studio reads, as data.
 *
 * Read through a literal property access rather than `process.env[name]`,
 * because only a literal is replaced at build time — a dynamic lookup is `{}`
 * in the browser, and a setup screen that lists nothing is worse than no setup
 * screen at all.
 *
 * The list is the whole contract with the console: `npm run console` writes
 * exactly these into `apps/studio/.env.local`.
 */

export interface StudioEnvVar {
  name: string;
  /** What the studio does with it, in the words of somebody who has to go find it. */
  purpose: string;
  /** What a value looks like, so a wrong one is recognizable on sight. */
  example: string;
}

export const STUDIO_ENV_VARS: readonly StudioEnvVar[] = [
  {
    name: 'NEXT_PUBLIC_ACHAR_API_URL',
    purpose: 'The content API this studio reads and writes. Everything else here is sign-in.',
    example: 'https://abc123.execute-api.eu-west-1.amazonaws.com',
  },
  {
    name: 'NEXT_PUBLIC_ACHAR_REGION',
    purpose: 'The AWS region the user pool lives in.',
    example: 'eu-west-1',
  },
  {
    name: 'NEXT_PUBLIC_ACHAR_USER_POOL_ID',
    purpose: 'The Cognito user pool people sign in to.',
    example: 'eu-west-1_a1b2C3d4E',
  },
  {
    name: 'NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID',
    purpose: 'The app client inside that pool, and the id the studio presents to it.',
    example: '7f3k2m9p1q8r5t4v6w0x2y4z',
  },
  {
    name: 'NEXT_PUBLIC_ACHAR_AUTH_DOMAIN',
    purpose: 'The Hosted UI domain Google sign-in is redirected through.',
    example: 'achar-dev.auth.eu-west-1.amazoncognito.com',
  },
];

export function envValue(name: string): string {
  switch (name) {
    case 'NEXT_PUBLIC_ACHAR_API_URL':
      return process.env.NEXT_PUBLIC_ACHAR_API_URL ?? '';
    case 'NEXT_PUBLIC_ACHAR_REGION':
      return process.env.NEXT_PUBLIC_ACHAR_REGION ?? '';
    case 'NEXT_PUBLIC_ACHAR_USER_POOL_ID':
      return process.env.NEXT_PUBLIC_ACHAR_USER_POOL_ID ?? '';
    case 'NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID':
      return process.env.NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID ?? '';
    case 'NEXT_PUBLIC_ACHAR_AUTH_DOMAIN':
      return process.env.NEXT_PUBLIC_ACHAR_AUTH_DOMAIN ?? '';
    default:
      return '';
  }
}

/** The API url, from `authConfigFromEnv()` when there is a config and the raw variable otherwise. */
export function apiUrlFromEnv(): string {
  return envValue('NEXT_PUBLIC_ACHAR_API_URL').replace(/\/+$/, '');
}
