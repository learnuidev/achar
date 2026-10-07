'use client';

import { Fragment, type ReactNode } from 'react';
import type {
  PortableText as PortableTextValue,
  PortableTextBlock,
  PortableTextImage,
  PortableTextNode,
  PortableTextSpan,
} from '@achar/types';
import { cn } from '@achar/ui';
import { useAssetLibrary } from '@/components/content/asset-library';

/**
 * Rich text, rendered the way a reader sees it.
 *
 * Deliberately duplicated from `apps/web` rather than shared: the two are
 * different surfaces with different dependencies, and a studio that imported
 * the site's renderer could not be built without the site. What they do share
 * is the thing that makes them look alike — the `.achar-prose` class, which is
 * the design system's answer to typography, and the only reason the same
 * document reads the same in both places.
 *
 * The props are the value and a class name, and nothing else. An embedded image
 * is a reference to an asset, and the library that resolves it comes from the
 * context rather than a prop, so this component can be dropped anywhere without
 * being handed a studio.
 */
export function PortableText({
  value,
  className,
}: {
  value: PortableTextValue;
  className?: string;
}) {
  const nodes = Array.isArray(value) ? value : [];

  return <div className={cn('achar-prose', className)}>{renderNodes(nodes)}</div>;
}

/**
 * Blocks in order, with consecutive list items gathered into one list.
 *
 * A list is a run of blocks rather than a container in portable text — each
 * item is its own block with `listItem` set — so the wrapping element has to be
 * inferred from the run. Grouping here rather than storing a list in the
 * document is what lets an item be a paragraph, a heading, or anything else
 * later, without the document having to say so now.
 */
function renderNodes(nodes: PortableTextNode[], keyPrefix = ''): ReactNode[] {
  const out: ReactNode[] = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!node) continue;

    if (node._type === 'image') {
      out.push(<RichImage key={`${keyPrefix}${node._key || index}`} node={node} />);
      continue;
    }

    if (node.listItem) {
      const listTag = node.listItem === 'number' ? 'ol' : 'ul';
      const items: PortableTextBlock[] = [];
      let cursor = index;
      while (cursor < nodes.length) {
        const candidate = nodes[cursor];
        if (!candidate || candidate._type !== 'block' || candidate.listItem !== node.listItem) break;
        items.push(candidate);
        cursor += 1;
      }
      index = cursor - 1;

      const children = items.map((item, itemIndex) => (
        <li key={`${keyPrefix}${item._key || itemIndex}`}>{renderSpans(item)}</li>
      ));

      out.push(
        listTag === 'ol' ? (
          <ol key={`list-${node._key || index}`}>{children}</ol>
        ) : (
          <ul key={`list-${node._key || index}`}>{children}</ul>
        ),
      );
      continue;
    }

    out.push(<RichBlock key={`${keyPrefix}${node._key || index}`} block={node} />);
  }

  return out;
}

function RichBlock({ block }: { block: PortableTextBlock }) {
  const content = renderSpans(block);

  switch (block.style) {
    case 'h1':
      // The document's own shape decides the tag, so an `h1` in a body field is
      // drawn as one rather than demoted: a heading a person wrote is a heading.
      return <h1 className="text-3xl font-semibold tracking-tight">{content}</h1>;
    case 'h2':
      return <h2>{content}</h2>;
    case 'h3':
      return <h3>{content}</h3>;
    case 'h4':
      return <h4>{content}</h4>;
    case 'blockquote':
      return <blockquote>{content}</blockquote>;
    default:
      return <p>{content}</p>;
  }
}

/** The runs of one block, with their marks applied. */
function renderSpans(block: PortableTextBlock): ReactNode {
  const spans = Array.isArray(block.children) ? block.children : [];
  const defs = new Map((block.markDefs ?? []).map((def) => [def._key, def]));

  if (spans.length === 0) {
    // An empty block is still a line, and dropping it would close the gap the
    // person left between two paragraphs.
    return <br />;
  }

  return spans.map((span, index) => <Fragment key={span._key || index}>{markSpan(span, defs)}</Fragment>);
}

function markSpan(
  span: PortableTextSpan,
  defs: Map<string, { _key: string; _type: string; [field: string]: unknown }>,
): ReactNode {
  // Applied inner to outer in the order the marks are declared, so `strong` and
  // `code` nest the same way whichever order they were toggled in.
  return (span.marks ?? []).reduce<ReactNode>((node, mark) => {
    if (mark === 'strong') return <strong>{node}</strong>;
    if (mark === 'em') return <em>{node}</em>;
    if (mark === 'code') return <code>{node}</code>;
    if (mark === 'underline') return <u>{node}</u>;
    if (mark === 'strike-through') return <s>{node}</s>;

    const def = defs.get(mark);
    if (!def) return node;
    if (def._type === 'link' && typeof def.href === 'string') {
      const external = /^https?:\/\//.test(def.href);
      return (
        <a href={def.href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {node}
        </a>
      );
    }
    return node;
  }, span.text);
}

/**
 * An image inside rich text.
 *
 * Its `_ref` is resolved through the asset library, which means the URL is the
 * CDN's rather than one baked into the document. An asset that is not in the
 * library — deleted since, or an environment whose library has not loaded —
 * draws as a labelled placeholder rather than as a broken frame.
 */
function RichImage({ node }: { node: PortableTextImage }) {
  const { urlFor } = useAssetLibrary();
  const reference = node.asset?._ref ?? null;
  const url = urlFor(reference);

  if (!url) {
    return (
      <figure>
        <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted px-4 py-6 text-xs text-muted-foreground">
          {node.alt || reference || 'Image'}
        </div>
        {node.caption && <figcaption>{node.caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure>
      {/* eslint-disable-next-line @next/next/no-img-element -- the asset CDN is not in `remotePatterns`, and the URL is already transformed. */}
      <img src={url} alt={node.alt ?? ''} loading="lazy" />
      {node.caption && <figcaption>{node.caption}</figcaption>}
    </figure>
  );
}
