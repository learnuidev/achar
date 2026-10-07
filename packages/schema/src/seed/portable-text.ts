import type { PortableTextBlock, PortableTextSpan } from '@achar/types';

/**
 * A portable-text body builder, scoped to one document.
 *
 * Every block and every span needs a `_key` unique within its document, and
 * hand-writing ninety of them across ten posts is exactly where a duplicate gets
 * in — which an editor finds by refusing to render one of the two, long after the
 * seed was written. So a builder is made once per post with the post's id as a
 * prefix and numbers what it is handed: stable across runs, unique within the
 * document, and quiet at the call site.
 *
 * `list` returns an array because a list is several blocks, and they are meant to
 * be spread into place — the order they appear in is the order they are drawn in.
 */
export function bodyFor(prefix: string): BodyBuilder {
  let index = 0;
  const nextKey = () => `${prefix}-${(index += 1)}`;

  const span = (text: string, marks: string[] = []): PortableTextSpan => ({
    _type: 'span',
    _key: nextKey(),
    text,
    marks,
  });

  const block = (
    style: PortableTextBlock['style'],
    text: string,
    marks: string[] = [],
  ): PortableTextBlock => ({
    _type: 'block',
    _key: nextKey(),
    style,
    children: [span(text, marks)],
    markDefs: [],
  });

  return {
    p: (text) => block('normal', text),
    h2: (text) => block('h2', text),
    h3: (text) => block('h3', text),
    quote: (text) => block('blockquote', text),
    // A code block is a span with the `code` mark rather than a node of its own:
    // the mark is what an editor's toolbar sets, and a node would be a second
    // thing every renderer has to learn.
    code: (text) => block('normal', text, ['code']),
    list: (items, ordered = false) =>
      items.map((item) => ({
        ...block('normal', item),
        listItem: ordered ? ('number' as const) : ('bullet' as const),
        level: 1,
      })),
  };
}

interface BodyBuilder {
  p: (text: string) => PortableTextBlock;
  h2: (text: string) => PortableTextBlock;
  h3: (text: string) => PortableTextBlock;
  quote: (text: string) => PortableTextBlock;
  code: (text: string) => PortableTextBlock;
  list: (items: string[], ordered?: boolean) => PortableTextBlock[];
}
