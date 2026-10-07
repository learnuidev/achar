/**
 * Language codes, as a person reads them.
 *
 * A dataset stores codes — `pt-BR` is the key a document's values sit under, and
 * the string every query echoes — while a person choosing one is thinking about a
 * language rather than a tag. `Intl` is the only thing in the runtime that knows
 * the mapping, so it is the only thing asked: a table written here would be a
 * second registry to keep current, and it would be silent about the one language
 * nobody thought to list, which is exactly the case the free-text field exists for.
 *
 * Names are resolved in the reader's own locale, as `formatDate` beside this file
 * already formats dates. The studio's reads all arrive after mount — `useResource`
 * starts empty — so there is no server render for a locale to disagree with.
 */

/**
 * The handful offered as buttons when somebody adds a language.
 *
 * Short on purpose: it is there to save typing for the languages most datasets
 * reach for first, not to be the list of languages that exist. Every other code is
 * still expressible by typing it, because the API checks the shape of a code and
 * knows nothing about which languages are real.
 */
export const LANGUAGE_SUGGESTIONS: readonly string[] = [
  'en',
  'es',
  'fr',
  'de',
  'pt-BR',
  'it',
  'nl',
  'ja',
  'zh-Hans',
  'ar',
];

// Built once, on first use: `Intl.DisplayNames` is not cheap to construct, and a card
// listing six languages would otherwise construct six. `undefined` is the "not asked
// yet" state, so a runtime that has no `Intl.DisplayNames` asks itself once and is
// remembered as `null` — which is what the fallback in `languageName` is for.
let displayNameCache: Intl.DisplayNames | null | undefined;

function displayNames(): Intl.DisplayNames | null {
  if (displayNameCache === undefined) {
    displayNameCache =
      typeof Intl.DisplayNames === 'function'
        ? new Intl.DisplayNames(undefined, { type: 'language' })
        : null;
  }
  return displayNameCache;
}

/**
 * `pt-BR` reads as "Brazilian Portuguese"; a code nothing can name comes back as it
 * was written.
 *
 * Two things end at the raw code: a language the runtime's ICU data has no name for,
 * which `of` answers by echoing the code back — sometimes lowercased — and a string
 * that is not a language code at all, which `of` refuses with a `RangeError`. A
 * guessed name would be worse than the code in both cases, and this runs on whatever
 * a dataset holds rather than on a list this file knows.
 */
export function languageName(code: string): string {
  const names = displayNames();
  if (!names) return code;

  try {
    const name = names.of(code);
    // The dataset's spelling is what queries and the editor's language lane carry,
    // so it is returned when `of` only echoes the code back, sometimes lowercased.
    return name && name.toLowerCase() !== code.toLowerCase() ? name : code;
  } catch {
    return code;
  }
}
