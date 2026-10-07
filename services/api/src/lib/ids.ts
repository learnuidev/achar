/**
 * Identifiers.
 *
 * A ULID rather than a UUID, because the first ten characters are the
 * millisecond it was made in and the rest is random: two ids sort into the order
 * they were created, which is what makes `_rev` useful in a log line and what
 * makes a freshly minted id land at the end of a key range rather than anywhere
 * in it. Nothing in this API parses an id — the time prefix is a convenience for
 * whoever is reading a table by hand, and no code may depend on it.
 *
 * The encoding is written out here rather than pulled from a package because
 * `ulid` is not a dependency this service declares, and a Lambda bundle that
 * grows a module for twenty lines of base32 is a bundle somebody has to audit
 * later. `randomBytes` is Node's, which is the same entropy either way.
 */

import { randomBytes } from 'node:crypto';
import { slugify } from '@achar/schema';

/** Crockford base32: no `I`, `L`, `O` or `U`, so an id read aloud is unambiguous. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

let lastTime = 0;
let lastRandom = new Uint8Array(RANDOM_CHARS);

/**
 * A new ULID.
 *
 * Within one millisecond the random half is incremented rather than redrawn, so
 * ids made in a tight loop are ordered too. That is not required of a ULID —
 * only the time prefix is — but it is what keeps a batch of documents written in
 * one transaction sorting as the batch was written.
 */
export function ulid(now: number = Date.now()): string {
  let time = now;
  if (time === lastTime) {
    increment(lastRandom);
  } else {
    lastTime = time;
    lastRandom = randomBytes(RANDOM_CHARS);
  }

  let timePart = '';
  for (let index = 0; index < TIME_CHARS; index += 1) {
    timePart = ALPHABET[time % 32] + timePart;
    time = Math.floor(time / 32);
  }

  let randomPart = '';
  for (const byte of lastRandom) {
    randomPart += ALPHABET[byte % 32];
  }

  return timePart + randomPart;
}

/** Carries `A` to `B` the way the alphabet counts, wrapping at the front. */
function increment(bytes: Uint8Array): void {
  for (let index = bytes.length - 1; index >= 0; index -= 1) {
    if (bytes[index] < 255) {
      bytes[index] += 1;
      return;
    }
    bytes[index] = 0;
  }
}

/**
 * The revision a write produced.
 *
 * Opaque, compared and never parsed — see `documents.ts`, where it is also the
 * range key and therefore the reason every write is a transaction. It is minted
 * fresh on every write so that two clients that saved the same document can be
 * told apart by which revision they were holding.
 */
export function rev(): string {
  return ulid();
}

/** `acme-content-9f2c41` — a name somebody can read, and a suffix that is unique. */
export function slugFor(name: string): string {
  const base = slugify(name).slice(0, 48).replace(/-+$/, '');
  return base ? `${base}-${shortSuffix()}` : shortSuffix(10);
}

/** Six hex characters, for the part of a slug that has to be unique. */
export function shortSuffix(length = 6): string {
  return randomBytes(8).toString('hex').slice(0, length);
}

/** A secret half of a token or a signing key, in a form safe to paste into a shell. */
export function secret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Re-exported so `ids.ts` is the one import for naming anything the API creates. */
export { slugify };
