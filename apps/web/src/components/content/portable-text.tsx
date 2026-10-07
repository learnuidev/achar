import { Fragment, type ReactNode } from 'react';
import type {
  PortableText as PortableTextValue,
  PortableTextBlock,
  PortableTextImage,
  PortableTextMarkDef,
  PortableTextSpan,
} from '@achar/types';
import { cn } from '@achar/ui';

/**
 * Rich text, rendered as React elements and never as markup.
 *
 * `dangerouslySetInnerHTML` is the obvious way to render Portable Text and it is
 * the one way this system could be made to execute what it stores: the field is
 * an array of objects, a document is authored in the studio by anyone with edit
 * rights, and the moment the two meet as a string the content model stops being
 * data and becomes a program. So every node below is an element, marks become
 * nested components, and the only attribute a document can set is an `href` — and
 * even that is checked (`safeHref`) before it reaches the DOM.
 *
 * The props are exactly `{ value, className }` on purpose: `apps/studio` renders
 * its preview with this component, so anything it needed beyond the value would
 * be a second renderer written for the editor.
 */
export function PortableText({ value, className }: { value: PortableTextValue; className?: string }) {
  return <div className={cn('achar-prose', className)}>{renderNodes(value)}</div>;
}

function renderNodes(nodes: PortableTextValue): ReactNode[] {
  const rendered: ReactNode[] = [];
  let index = 0;

  while (index < nodes.length) {
    const node = nodes[index];

    if (node._type === 'image') {
      rendered.push(<RichTextImage key={node._key ?? `image-${index}`} image={node} />);
      index += 1;
      continue;
    }

    if (node.listItem) {
      // Consecutive list items of the same kind are one list, which is what makes
      // `<ul><li/><li/></ul>` rather than a `<ul>` per item. A change of kind
      // starts a new one, because a numbered item after a bulleted item is
      // genuinely a second list.
      const kind = node.listItem;
      const run: PortableTextBlock[] = [];
      while (index < nodes.length) {
        const candidate = nodes[index];
        if (candidate._type !== 'block' || candidate.listItem !== kind) break;
        run.push(candidate);
        index += 1;
      }
      rendered.push(<RichTextList key={run[0]._key ?? `list-${index}`} blocks={run} />);
      continue;
    }

    rendered.push(<RichTextBlock key={node._key ?? `block-${index}`} block={node} />);
    index += 1;
  }

  return rendered;
}

/** A paragraph, a heading or a quote — everything that is not a list or an image. */
function RichTextBlock({ block }: { block: PortableTextBlock }) {
  const children = renderSpans(block);

  // A block whose every span is marked `code` is a code block, not a paragraph
  // that happens to contain code: `code` is a mark rather than a node type, so
  // this is the only signal that separates the two, and it is the one the seed and
  // the editor's toolbar both produce.
  if (block.style === 'normal' && isCodeBlock(block)) {
    return (
      <pre>
        <code>{children}</code>
      </pre>
    );
  }

  switch (block.style) {
    case 'h1':
      return <h1>{children}</h1>;
    case 'h2':
      return <h2>{children}</h2>;
    case 'h3':
      return <h3>{children}</h3>;
    case 'h4':
      return <h4>{children}</h4>;
    case 'blockquote':
      return (
        <blockquote>
          <p>{children}</p>
        </blockquote>
      );
    default:
      // Anything else — `normal`, or a style somebody invented in a schema this
      // app has not seen — is a paragraph. A block that renders as nothing is a
      // sentence that disappears from the page.
      return <p>{children}</p>;
  }
}

/** Whether every span of a block carries the `code` mark. */
function isCodeBlock(block: PortableTextBlock): boolean {
  const spans = block.children ?? [];
  return spans.length > 0 && spans.every((span) => (span.marks ?? []).includes('code'));
}

/**
 * A run of list items, nested by `level`.
 *
 * `level` is 1-based depth rather than an index, so items at the run's shallowest
 * level are the list's own items and anything deeper belongs to the item it
 * follows. That is the whole of the nesting rule, and it is why this recurses
 * rather than emitting a flat list with an indent class.
 */
function RichTextList({ blocks }: { blocks: PortableTextBlock[] }) {
  const kind = blocks[0].listItem ?? 'bullet';
  const List = kind === 'number' ? 'ol' : 'ul';
  const baseLevel = Math.min(...blocks.map((block) => block.level ?? 1));

  const items: { key: string; content: ReactNode; nested: ReactNode[] }[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];

    if ((block.level ?? 1) > baseLevel) {
      const deeper: PortableTextBlock[] = [];
      while (index < blocks.length && (blocks[index].level ?? 1) > baseLevel) {
        deeper.push(blocks[index]);
        index += 1;
      }
      if (items.length > 0) {
        items[items.length - 1].nested.push(
          <RichTextList key={`nested-${deeper[0]._key ?? index}`} blocks={deeper} />,
        );
      }
      continue;
    }

    items.push({ key: block._key ?? `item-${index}`, content: renderSpans(block), nested: [] });
    index += 1;
  }

  return (
    <List>
      {items.map((item) => (
        <li key={item.key}>
          {item.content}
          {item.nested}
        </li>
      ))}
    </List>
  );
}

/** The spans of one block, with each span's marks applied outside-in. */
function renderSpans(block: PortableTextBlock): ReactNode[] {
  const defs = new Map<string, PortableTextMarkDef>(
    (block.markDefs ?? []).map((definition) => [definition._key, definition]),
  );

  return (block.children ?? []).map((span, index) => (
    <Fragment key={span._key ?? `${block._key}-${index}`}>{mark(span, defs)}</Fragment>
  ));
}

function mark(span: PortableTextSpan, defs: Map<string, PortableTextMarkDef>): ReactNode {
  let node: ReactNode = span.text;
  const marks = span.marks ?? [];

  // Decorators first, so a link wraps the decorations rather than the other way
  // round — an anchor inside a `<strong>` reads as bold text that happens to be a
  // link, which is not what the author marked.
  if (marks.includes('code')) node = <code>{node}</code>;
  if (marks.includes('em')) node = <em>{node}</em>;
  if (marks.includes('strong')) node = <strong>{node}</strong>;

  for (const name of marks) {
    const definition = defs.get(name);
    if (!definition) continue;
    const href = safeHref(definition.href);
    if (!href) continue;
    node = (
      <a href={href} rel={href.startsWith('http') ? 'noreferrer noopener' : undefined}>
        {node}
      </a>
    );
  }

  return node;
}

/**
 * An `href` that cannot be a script.
 *
 * `javascript:` in an anchor is the same class of mistake as markup in a
 * `dangerouslySetInnerHTML`, and it is the one this renderer would otherwise
 * still make: a link is a mark definition with an `href` in it, and the field is
 * whatever an editor typed.
 */
function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (href.length === 0) return undefined;
  if (href.startsWith('/') || href.startsWith('#')) return href;
  if (/^(https?:|mailto:|tel:)/i.test(href)) return href;
  return undefined;
}

/**
 * An image node, resolved to bytes.
 *
 * A document stores an asset reference and the CDN turns it into a URL, so an
 * unresolved reference with no `NEXT_PUBLIC_ACHAR_CDN_URL` configured is a
 * document that names an image this deployment cannot address. That case draws a
 * labelled box rather than a broken `<img>` — the studio's preview runs this
 * component outside the site, and a preview that renders nothing is a preview
 * nobody can trust.
 */
function RichTextImage({ image }: { image: PortableTextImage }) {
  const src = imageSrc(image);
  const alt = image.alt ?? '';

  return (
    <figure>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- an asset CDN with
        // its own transform parameters is not something the image optimiser can
        // be pointed at, and rich text is not where layout shift is decided.
        <img src={src} alt={alt} loading="lazy" />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted p-6 text-sm text-muted-foreground"
        >
          {alt.length > 0 ? alt : image.asset?._ref}
        </div>
      )}
      {image.caption ? <figcaption>{image.caption}</figcaption> : null}
    </figure>
  );
}

function imageSrc(image: PortableTextImage): string | undefined {
  const reference = image.asset?._ref;
  if (typeof reference !== 'string') return undefined;
  if (reference.startsWith('http') || reference.startsWith('/')) return reference;
  const cdn = process.env.NEXT_PUBLIC_ACHAR_CDN_URL;
  return cdn ? `${cdn.replace(/\/$/, '')}/${reference}` : undefined;
}
