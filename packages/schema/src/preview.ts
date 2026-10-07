import type { SchemaType } from '@achar/types';

/**
 * What a list calls a document.
 *
 * The type's `preview` names the fields; this resolves them against one document
 * and hands back a title, an optional second line, and which field the media is
 * in — the field name rather than the asset, because the caller is a list that
 * already knows how to turn a reference into a URL and this function only knows
 * about the schema.
 *
 * `_id` is the fallback rather than `'(untitled)'`: an id is ugly and true, and a
 * list of forty rows all saying "(untitled)" is a list that has hidden the one
 * piece of information that would have found them.
 */
export function previewOf(
  type: SchemaType,
  document: Record<string, unknown>,
): { title: string; subtitle?: string; mediaField?: string } {
  const preview = type.preview;
  const title = stringAt(document, preview?.title) ?? stringAt(document, '_id') ?? '';
  const subtitle = stringAt(document, preview?.subtitle);

  return {
    title,
    ...(subtitle ? { subtitle } : {}),
    ...(preview?.media ? { mediaField: preview.media } : {}),
  };
}

/**
 * A field's value as a string, at a dotted path.
 *
 * A path may run through a list — a `preview.title` of `metrics.0.label` — so a
 * numeric segment indexes an array rather than looking up a key, which is the one
 * place a path in this package is not simply an object lookup.
 */
function stringAt(document: Record<string, unknown>, path: string | undefined): string | undefined {
  if (!path) return undefined;

  let current: unknown = document;
  for (const segment of path.split('.')) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' && current !== '' ? current : undefined;
}
