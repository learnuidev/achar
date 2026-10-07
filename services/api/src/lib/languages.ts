/**
 * Languages: the list a dataset is authored in, and the one a read answers.
 *
 * The list lives on the dataset row — see `Dataset` in `@achar/types` for why
 * that is the boundary — which means everything here is about the two asymmetries
 * that come with storing a list of strings on a row that already existed:
 *
 * - **A dataset that has never been told is an English one.** Every read of a
 *   dataset written before languages existed has to answer something, and a
 *   default nobody chose is better than a `null` every caller has to branch on.
 * - **Codes are compared, not normalized.** `pt-BR` is stored as it was written
 *   and matched case-insensitively against what a caller asks for, so a site
 *   asking for `pt-br` gets Brazilian Portuguese rather than a 400 about case.
 *   What a read *echoes back* is the dataset's spelling, so a client can put the
 *   string it was answered with into the next request and be sure of the answer.
 */

import { HttpError } from './http';

/**
 * The language a dataset has until somebody says otherwise.
 *
 * `en` because the content this repository seeds is English, and because a
 * dataset's first write is usually a migration of prose somebody already wrote.
 * It is a starting point rather than a policy: one PATCH replaces it.
 */
export const DEFAULT_LANGUAGE = 'en';

/**
 * What a language code looks like: `en`, `pt-BR`, `zh-Hant`, `es-419`, `x-internal`.
 *
 * A shape check rather than a registry: Achar does not know which languages exist
 * and should not pretend to — an unreleased code, a regional variant, or a team's
 * own private tag is somebody's real setup, and refusing it would be this API having
 * an opinion about a content team's process. The single-letter first subtag is BCP-47's
 * private use, which is why it is allowed here and nowhere in a document's fields.
 *
 * What it catches is the mistake worth catching: a sentence, or a code with
 * punctuation in it. It does not catch every non-language — `English` is a
 * shape-valid code and is stored as one — and it should not try: a name where a code
 * belongs is visible in the studio the moment it is used, and a validator guessing at
 * which strings are languages is a validator that refuses somebody's.
 */
const LANGUAGE_CODE = /^[A-Za-z]{1,8}(?:-[A-Za-z0-9]{1,8})*$/;

/** Whether two codes are the same language, ignoring case. */
export function sameLanguage(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/**
 * The languages a dataset row holds, with the answer a row from before this
 * existed gets.
 *
 * A `defaultLanguage` that is not in the list — a hand-edited row, or a list a
 * buggy migration rewrote — is answered by the first language rather than by an
 * error: every read needs a default, and a 500 about a row's own inconsistency is
 * not something a caller can act on.
 */
export function languagesOf(record: {
  languages?: unknown;
  defaultLanguage?: unknown;
}): { languages: string[]; defaultLanguage: string } {
  const stated = Array.isArray(record.languages)
    ? record.languages.filter(
        (code): code is string => typeof code === 'string' && LANGUAGE_CODE.test(code),
      )
    : [];

  if (stated.length === 0) return { languages: [DEFAULT_LANGUAGE], defaultLanguage: DEFAULT_LANGUAGE };

  const wanted = typeof record.defaultLanguage === 'string' ? record.defaultLanguage : '';
  const winner = stated.find((code) => sameLanguage(code, wanted));
  return { languages: stated, defaultLanguage: winner ?? stated[0]! };
}

/**
 * A language list a request sent, read and checked.
 *
 * The list is written whole rather than appended to, for the reason a schema is
 * `PUT` rather than `PATCH`: two clients adding a language at the same moment are
 * two writes with one winner, and the caller that lost never learns the list it
 * was editing is not the list that exists.
 */
export function requireLanguages(
  value: unknown,
  defaultLanguage?: unknown,
): { languages: string[]; defaultLanguage: string } {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(400, 'BAD_REQUEST', 'languages must be a non-empty list of language codes', {
      field: 'languages',
    });
  }

  const languages: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !LANGUAGE_CODE.test(entry.trim())) {
      throw new HttpError(
        400,
        'BAD_REQUEST',
        `${JSON.stringify(entry)} is not a language code — a language is \`en\`, \`pt-BR\`, \`zh-Hant\``,
        { field: 'languages', language: entry },
      );
    }
    const code = entry.trim();
    if (languages.some((known) => sameLanguage(known, code))) {
      throw new HttpError(400, 'BAD_REQUEST', `${code} is named twice in languages`, {
        field: 'languages',
        language: code,
      });
    }
    languages.push(code);
  }

  const wanted = typeof defaultLanguage === 'string' ? defaultLanguage.trim() : '';
  if (!wanted) return { languages, defaultLanguage: languages[0]! };

  const winner = languages.find((code) => sameLanguage(code, wanted));
  if (!winner) {
    throw new HttpError(
      400,
      'BAD_REQUEST',
      `defaultLanguage ${wanted} is not one of the languages being set`,
      { field: 'defaultLanguage', languages },
    );
  }

  return { languages, defaultLanguage: winner };
}

/**
 * The language a read answers in.
 *
 * Named as the dataset spells it, and refused when the dataset has never heard of
 * it: a typo that quietly answered in the default language is a typo nobody finds,
 * and answering with the list makes the fix one request away.
 */
export function readLanguage(
  requested: string | undefined | null,
  dataset: { datasetName: string; languages: string[]; defaultLanguage: string },
): string {
  const wanted = requested?.trim();
  if (!wanted) return dataset.defaultLanguage;

  const winner = dataset.languages.find((code) => sameLanguage(code, wanted));
  if (!winner) {
    throw new HttpError(400, 'UNKNOWN_LANGUAGE', `${dataset.datasetName} is not authored in ${wanted}`, {
      language: wanted,
      languages: dataset.languages,
      defaultLanguage: dataset.defaultLanguage,
    });
  }
  return winner;
}
