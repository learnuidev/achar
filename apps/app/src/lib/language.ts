/**
 * The languages a dataset offers, as the studio needs them.
 *
 * `languageName` — `pt-BR` reads as "Brazilian Portuguese" — lives in
 * `@achar/schema`, beside the rest of the rules about a language, because the API
 * needs it too: the prompt a model is sent names the language in words rather than
 * in a tag, and a name computed one way in a studio and another way in a Lambda is
 * a site translated into something nobody asked for. This file is what the studio
 * adds on top: the handful of languages worth offering as buttons.
 */

export { languageName } from '@achar/schema';

/**
 * The languages offered as buttons when somebody adds one.
 *
 * Short on purpose: it is here to save typing for the languages most datasets reach
 * for first, not to be the list of languages that exist. Every other code is still
 * expressible by typing it, because the API checks the shape of a code and knows
 * nothing about which languages are real.
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
