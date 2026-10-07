/**
 * A URL segment for a title.
 *
 * Diacritics are folded rather than dropped — `NFKD` splits `é` into `e` plus a
 * combining accent, and the accent is what gets removed — so "Café Society"
 * becomes `cafe-society` instead of `caf-society`. Anything else that is not a
 * letter or a digit becomes a single dash, which is why the runs are collapsed:
 * "Draft & publish" would otherwise be `draft--publish`, a slug nobody types and
 * two different documents could produce.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
