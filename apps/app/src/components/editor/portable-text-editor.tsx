'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoldIcon,
  CodeIcon,
  ImagePlusIcon,
  IndentDecreaseIcon,
  IndentIncreaseIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import type { Asset, PortableText } from '@achar/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  cn,
} from '@achar/ui';
import { PortableText as PortableTextRenderer } from '@/components/studio/portable-text';
import { AssetPicker } from '@/components/editor/asset-picker';
import { useAssetLibrary } from '@/components/studio/asset-library';
import {
  BLOCK_STYLES,
  applyLink,
  blockText,
  emptyBlock,
  emptyImage,
  fromEditable,
  isLink,
  keyOf,
  marksInRange,
  pruneMarkDefs,
  spliceText,
  toEditable,
  toggleMark,
  type EditableBlock,
  type EditableNode,
} from '@/lib/portable-text';

/**
 * Rich text, edited as a list of blocks.
 *
 * Deliberately not `contentEditable`. A contenteditable region hands back HTML,
 * and HTML is a *rendering* of portable text rather than the thing itself: two
 * spellings of the same markup become two documents, an empty paragraph survives
 * as `<p><br></p>`, and the marks a person toggles are re-derived from tags on
 * every keystroke. A block list is the document's own shape — style, list item,
 * spans, marks, mark definitions — so what is typed is what is stored, and no
 * dependency is needed to keep the two in step.
 *
 * What that costs is that the toolbar has to be honest about the selection, since
 * a textarea knows nothing about formatting: the selection is read from the
 * element on every event, the marks under it light the buttons up, and a toggle
 * rewrites the spans of that block alone. Everything else — moving a block,
 * turning it into a heading, inserting an image between two paragraphs — is a
 * change to the array, which is the same array the API stores.
 */
export interface PortableTextEditorProps {
  value: PortableText;
  onChange: (next: PortableText) => void;
  readOnly?: boolean;
  placeholder?: string;
  /** The schema field's `rows`, used only to size the editor. */
  rows?: number;
}

export function PortableTextEditor({
  value,
  onChange,
  readOnly = false,
  placeholder,
  rows,
}: PortableTextEditorProps) {
  // The fallback block for an empty field is created once: a fresh key per render
  // would remount the textarea underneath whoever is typing into it.
  const fallback = useRef(emptyBlock());
  const nodes = useMemo<EditableNode[]>(() => {
    const editable = toEditable(value);
    return editable.length > 0 ? editable : [fallback.current];
  }, [value]);

  const [selection, setSelection] = useState<{ key: string; start: number; end: number } | null>(null);
  const [linkFor, setLinkFor] = useState<{ key: string; start: number; end: number } | null>(null);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const textareas = useRef(new Map<string, HTMLTextAreaElement>());

  useEffect(() => {
    if (!focusKey) return;
    const element = textareas.current.get(focusKey);
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
    setFocusKey(null);
  }, [focusKey, nodes]);

  function commit(next: EditableNode[], focus?: string) {
    onChange(fromEditable(next));
    if (focus) setFocusKey(focus);
  }

  function updateBlock(key: string, change: (block: EditableBlock) => EditableBlock) {
    commit(
      nodes.map((node) =>
        keyOf(node) === key && node.kind === 'block' ? change(node) : node,
      ),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= nodes.length) return;
    const copy = [...nodes];
    const [moving] = copy.splice(index, 1);
    copy.splice(target, 0, moving);
    commit(copy);
  }

  function remove(key: string) {
    // A document with no blocks is not a document: removing the last line leaves
    // one empty line rather than an empty editor with nothing to type into.
    const remaining = nodes.filter((node) => keyOf(node) !== key);
    commit(remaining.length > 0 ? remaining : [emptyBlock()]);
  }

  function addAfter(index: number) {
    const block = emptyBlock();
    const copy = [...nodes];
    copy.splice(index + 1, 0, block);
    commit(copy, block._key);
  }

  if (readOnly) {
    return <PortableTextRenderer value={fromEditable(nodes)} className="rounded-lg border border-border bg-muted p-4" />;
  }

  const minimumHeight = rows ? `${Math.min(Math.max(rows, 6), 16) * 1.5 + 4}rem` : undefined;

  return (
    <div className="space-y-2">
      <div className="space-y-2" style={minimumHeight ? { minHeight: minimumHeight } : undefined}>
        {nodes.map((node, index) => (
          <NodeRow
            key={keyOf(node)}
            node={node}
            index={index}
            count={nodes.length}
            selection={selection && selection.key === keyOf(node) ? selection : null}
            placeholder={placeholder}
            registerTextarea={(element) => {
              const key = keyOf(node);
              if (element) textareas.current.set(key, element);
              else textareas.current.delete(key);
            }}
            onSelect={(start, end) => setSelection({ key: keyOf(node), start, end })}
            onChangeText={(text) => {
              if (node.kind !== 'block') return;
              updateBlock(node._key, (block) => ({ ...block, spans: spliceText(block.spans, text) }));
            }}
            onToggleMark={(mark, start, end) => {
              if (node.kind !== 'block') return;
              updateBlock(node._key, (block) => ({
                ...block,
                spans: toggleMark(block.spans, start, end, mark),
              }));
            }}
            onLink={() => {
              if (node.kind !== 'block' || !selection) return;
              setLinkFor({ key: node._key, start: selection.start, end: selection.end });
            }}
            onStyle={(style) => {
              if (node.kind !== 'block') return;
              updateBlock(node._key, (block) => ({ ...block, style }));
            }}
            onListItem={(listItem) => {
              if (node.kind !== 'block') return;
              updateBlock(node._key, (block) => ({
                ...block,
                ...(block.listItem === listItem ? { listItem: undefined } : { listItem }),
                level: block.level ?? 1,
              }));
            }}
            onIndent={(delta) => {
              if (node.kind !== 'block') return;
              updateBlock(node._key, (block) => ({
                ...block,
                level: Math.min(3, Math.max(1, (block.level ?? 1) + delta)),
              }));
            }}
            onAlt={(alt) => {
              if (node.kind !== 'image') return;
              commit(nodes.map((candidate) =>
                keyOf(candidate) === node._key && candidate.kind === 'image'
                  ? { ...candidate, alt }
                  : candidate,
              ));
            }}
            onCaption={(caption) => {
              if (node.kind !== 'image') return;
              commit(nodes.map((candidate) =>
                keyOf(candidate) === node._key && candidate.kind === 'image'
                  ? { ...candidate, caption }
                  : candidate,
              ));
            }}
            onAddAfter={() => addAfter(index)}
            onMove={(direction) => move(index, direction)}
            onRemove={() => remove(node._key)}
            onInsertImage={() => setPickingFor(node._key)}
          />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Each line is a block. <span className="font-mono">⌘B</span> bold,{' '}
        <span className="font-mono">⌘I</span> italic, <span className="font-mono">⌘E</span> code,{' '}
        <span className="font-mono">Enter</span> a new line — and every line is saved as part of the
        draft as you type.
      </p>

      <Dialog open={linkFor !== null} onOpenChange={(open) => !open && setLinkFor(null)}>
        <LinkDialog
          onSubmit={(href) => {
            if (!linkFor || !href.trim()) {
              setLinkFor(null);
              return;
            }
            const target = linkFor;
            const block = nodes.find((node) => keyOf(node) === target.key);
            if (block && block.kind === 'block') {
              const linked = pruneMarkDefs(
                applyLink(block, target.start, target.end, href.trim()),
              );
              updateBlock(block._key, () => linked);
            }
            setLinkFor(null);
          }}
        />
      </Dialog>

      {pickingFor && (
        <AssetPicker
          open
          onOpenChange={(open) => !open && setPickingFor(null)}
          accept="image"
          onSelect={(asset: Asset) => {
            const image = emptyImage(asset);
            const index = nodes.findIndex((node) => keyOf(node) === pickingFor);
            const copy = [...nodes];
            copy.splice(index + 1, 0, image);
            commit(copy, image._key);
            setPickingFor(null);
          }}
        />
      )}
    </div>
  );
}

/** One block, with its own toolbar above it. */
function NodeRow({
  node,
  index,
  count,
  selection,
  placeholder,
  registerTextarea,
  onSelect,
  onChangeText,
  onToggleMark,
  onLink,
  onStyle,
  onListItem,
  onIndent,
  onAlt,
  onCaption,
  onAddAfter,
  onMove,
  onRemove,
  onInsertImage,
}: {
  node: EditableNode;
  index: number;
  count: number;
  selection: { key: string; start: number; end: number } | null;
  placeholder?: string;
  registerTextarea: (element: HTMLTextAreaElement | null) => void;
  onSelect: (start: number, end: number) => void;
  onChangeText: (text: string) => void;
  onToggleMark: (mark: string, start: number, end: number) => void;
  onLink: () => void;
  onStyle: (style: EditableBlock['style']) => void;
  onListItem: (listItem: 'bullet' | 'number') => void;
  onIndent: (delta: -1 | 1) => void;
  onAlt: (alt: string) => void;
  onCaption: (caption: string) => void;
  onAddAfter: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onInsertImage: () => void;
}) {
  if (node.kind === 'image') {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <ImageNode
          reference={node.reference}
          alt={node.alt}
          caption={node.caption}
          onAlt={onAlt}
          onCaption={onCaption}
          onAddAfter={onAddAfter}
          onMove={onMove}
          onRemove={onRemove}
          index={index}
          count={count}
        />
      </div>
    );
  }

  const text = blockText(node);
  const active = selection ? marksInRange(node.spans, selection.start, selection.end) : [];
  const hasMarkup = node.spans.length > 1 || node.spans.some((span) => span.marks.length > 0);

  return (
    <div className="rounded-xl border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-1 pb-1.5">
        <Select
          value={node.style}
          onValueChange={(next) => {
            const style = BLOCK_STYLES.find((candidate) => candidate.value === next)?.value;
            if (style) onStyle(style);
          }}
        >
          <SelectTrigger className="h-8 w-36 text-xs" aria-label="Block style">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_STYLES.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Divider />

        <ToolbarButton
          label="Bold"
          active={active.includes('strong')}
          onClick={() => selection && onToggleMark('strong', selection.start, selection.end)}
          icon={<BoldIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Italic"
          active={active.includes('em')}
          onClick={() => selection && onToggleMark('em', selection.start, selection.end)}
          icon={<ItalicIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Code"
          active={active.includes('code')}
          onClick={() => selection && onToggleMark('code', selection.start, selection.end)}
          icon={<CodeIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Link"
          active={active.some((mark) => isLink(mark, node.markDefs))}
          onClick={onLink}
          icon={<LinkIcon className="size-3.5" />}
        />

        <Divider />

        <ToolbarButton
          label="Bullet list"
          active={node.listItem === 'bullet'}
          onClick={() => onListItem('bullet')}
          icon={<ListIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Numbered list"
          active={node.listItem === 'number'}
          onClick={() => onListItem('number')}
          icon={<ListOrderedIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Outdent"
          disabled={(node.level ?? 1) <= 1}
          onClick={() => onIndent(-1)}
          icon={<IndentDecreaseIcon className="size-3.5" />}
        />
        <ToolbarButton
          label="Indent"
          disabled={(node.level ?? 1) >= 3}
          onClick={() => onIndent(1)}
          icon={<IndentIncreaseIcon className="size-3.5" />}
        />

        <Divider />

        <ToolbarButton
          label="Insert an image"
          onClick={onInsertImage}
          icon={<ImagePlusIcon className="size-3.5" />}
        />

        <div className="ml-auto flex items-center gap-1">
          <ToolbarButton
            label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            icon={<ArrowUpIcon className="size-3.5" />}
          />
          <ToolbarButton
            label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            icon={<ArrowDownIcon className="size-3.5" />}
          />
          <ToolbarButton
            label="Remove this block"
            destructive
            onClick={onRemove}
            icon={<Trash2Icon className="size-3.5" />}
          />
        </div>
      </div>

      <Textarea
        ref={registerTextarea}
        value={text}
        rows={node.style === 'normal' ? 2 : 1}
        placeholder={index === 0 ? placeholder : undefined}
        className={cn(
          'resize-y border-transparent bg-transparent font-normal shadow-none focus-visible:ring-0',
          node.style === 'h2' && 'text-lg font-semibold',
          node.style === 'h3' && 'text-base font-semibold',
          node.style === 'h4' && 'text-sm font-semibold',
          node.style === 'blockquote' && 'italic text-muted-foreground',
        )}
        onSelect={(event) =>
          onSelect(event.currentTarget.selectionStart ?? 0, event.currentTarget.selectionEnd ?? 0)
        }
        onChange={(event) => onChangeText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
            event.preventDefault();
            onAddAfter();
            return;
          }

          if (!(event.metaKey || event.ctrlKey) || event.shiftKey) return;
          const pressed = event.key.toLowerCase();
          const mark = pressed === 'b' ? 'strong' : pressed === 'i' ? 'em' : pressed === 'e' ? 'code' : null;
          if (!mark) return;

          // The range comes from the element rather than from the recorded
          // selection: a keystroke can arrive before the select event that would
          // have recorded where the caret is.
          event.preventDefault();
          onToggleMark(mark, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
        }}
      />

      {/* Marks are invisible in a textarea, so a block that carries any is drawn
          underneath as it will actually read — otherwise bold is a button that
          appears to do nothing. */}
      {hasMarkup && (
        <div className="mt-1 border-t border-dashed border-border pt-1.5">
          <PortableTextRenderer value={fromEditable([pruneMarkDefs(node)])} className="text-sm" />
        </div>
      )}
    </div>
  );
}

/** An image inside the text, with the two words a document stores about it. */
function ImageNode({
  reference,
  alt,
  caption,
  onAlt,
  onCaption,
  onAddAfter,
  onMove,
  onRemove,
  index,
  count,
}: {
  reference: string;
  alt: string;
  caption: string;
  onAlt: (value: string) => void;
  onCaption: (value: string) => void;
  onAddAfter: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  index: number;
  count: number;
}) {
  const library = useAssetLibrary();
  const url = library.urlFor(reference);

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`.
          <img src={url} alt="" className="max-h-40 rounded-lg border border-border object-contain" />
        ) : (
          <div className="flex h-20 w-32 items-center justify-center rounded-lg border border-dashed border-border bg-muted text-xs text-muted-foreground">
            not in the library
          </div>
        )}

        <div className="min-w-0 flex-1 space-y-2">
          <div className="grid gap-1">
            <Label className="text-xs">Alt text</Label>
            <Input value={alt} onChange={(event) => onAlt(event.target.value)} className="h-8 text-xs" />
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Caption</Label>
            <Input
              value={caption}
              onChange={(event) => onCaption(event.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ToolbarButton
            label="Move up"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            icon={<ArrowUpIcon className="size-3.5" />}
          />
          <ToolbarButton
            label="Move down"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            icon={<ArrowDownIcon className="size-3.5" />}
          />
          <ToolbarButton
            label="Remove this image"
            destructive
            onClick={onRemove}
            icon={<Trash2Icon className="size-3.5" />}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Stored as a reference to the asset, not a URL — the address is built when the document is
        read.
      </p>

      <Button type="button" variant="ghost" size="sm" onClick={onAddAfter}>
        <PlusIcon />
        Add a block after
      </Button>
    </div>
  );
}

function LinkDialog({ onSubmit }: { onSubmit: (href: string) => void }) {
  const [href, setHref] = useState('');

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Link the selected text</DialogTitle>
        <DialogDescription>
          Stored as a mark definition on the block, so the words and the address travel together.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="link-href">Address</Label>
        <Input
          id="link-href"
          value={href}
          onChange={(event) => setHref(event.target.value)}
          placeholder="https://example.com/a-page"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onSubmit(href);
            }
          }}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onSubmit('')}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSubmit(href)}>
          Add link
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />;
}

function ToolbarButton({
  label,
  icon,
  onClick,
  active,
  disabled,
  destructive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // The selection has to survive the click: a toolbar button that takes
      // focus first would leave the textarea with nothing selected to mark.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        active && 'border-border bg-accent text-accent-foreground',
        destructive && 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {icon}
    </button>
  );
}
