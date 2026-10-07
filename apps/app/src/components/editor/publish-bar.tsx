'use client';

import Link from 'next/link';
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  SaveIcon,
  SendIcon,
  Trash2Icon,
  UndoIcon,
} from 'lucide-react';
import { Button, cn } from '@achar/ui';
import { PublishStateBadge } from '@/components/studio/badges';
import { relativeTime } from '@/lib/format';

/** Where a document is in the draft/publish pair, as the bar words it. */
export type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error';

/**
 * The editor's top bar: which version you are looking at, whether it is saved,
 * and the three things you can do about it.
 *
 * The states are spelled out rather than reduced to a dot, because this is the
 * product's whole point. `Saving…`, `Saved`, `Unsaved changes` and a failure are
 * four different situations and only one of them is safe to close the tab on;
 * a bar that said "ok" for three of them would be a bar nobody trusts, and a
 * person who does not trust the save indicator keeps pressing the button.
 *
 * The same argument applies to the version line: a draft that has never been
 * published and a draft that has moved on since it was are both "a draft", and
 * an editor deciding whether to press Publish needs to know which one they have.
 */
export function PublishBar({
  backHref,
  backLabel,
  title,
  typeName,
  saveState,
  savedAt,
  error,
  hasDraft,
  published,
  isNew,
  canEdit,
  busy,
  previewOpen,
  history,
  languageSwitch,
  onTogglePreview,
  onSave,
  onPublish,
  onUnpublish,
  onDiscard,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  typeName: string;
  saveState: SaveState;
  savedAt: string | null;
  error: string | null;
  hasDraft: boolean;
  published: boolean;
  isNew: boolean;
  canEdit: boolean;
  busy: boolean;
  previewOpen: boolean;
  /** The history action, drawn beside Preview: both are ways of looking at the document. */
  history?: React.ReactNode;
  /**
   * Which language the fields are edited in, drawn beside Preview.
   *
   * A view of the document rather than a property of it — the same argument as the
   * preview button — which is why it is a slot here instead of a control inside the
   * form: switching language changes nothing about the document, and a control next
   * to the fields would read as one that does.
   */
  languageSwitch?: React.ReactNode;
  onTogglePreview: () => void;
  onSave: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onDiscard: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
      <div className="flex items-center gap-3 px-4 py-2.5">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeftIcon className="size-3.5" />
          {backLabel}
        </Link>

        <span className="truncate text-sm font-medium">{title}</span>
        <span className="shrink-0 font-mono text-xs text-muted-foreground">{typeName}</span>

        <div className="ml-auto flex items-center gap-2">
          {history}
          {languageSwitch}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onTogglePreview}
            title="Show the document as a reader sees it"
          >
            {previewOpen ? <EyeOffIcon /> : <EyeIcon />}
            Preview
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-2">
        <PublishStateBadge hasDraft={hasDraft || isNew} published={published} />

        <p className="min-w-0 flex-1 text-xs text-muted-foreground">{versionLine({ hasDraft, published, isNew })}</p>

        <SaveIndicator state={saveState} savedAt={savedAt} error={error} />

        {canEdit && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onSave}
              disabled={busy || saveState === 'saving'}
              title="Save the draft (⌘S)"
            >
              {saveState === 'saving' ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
              Save draft
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={onPublish}
              disabled={busy}
              title="Publish (⌘⏎)"
            >
              <SendIcon />
              Publish
            </Button>

            {published && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onUnpublish}
                disabled={busy}
                title="Take the published version away, leaving the draft"
              >
                <UndoIcon />
                Unpublish
              </Button>
            )}

            {hasDraft && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onDiscard}
                disabled={busy}
                className="text-muted-foreground"
                title="Throw the draft away and go back to what is published"
              >
                <Trash2Icon />
                Discard draft
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="px-4 pb-1.5 text-xs text-muted-foreground">
        Nothing is written until you save. A draft is a place for a half-written document, so a save
        is never blocked on validation — publishing is the step that warns, and the step that moves
        the draft onto the published id.
        {canEdit && (
          <>
            {' '}
            <span className="font-mono">⌘S</span> saves, <span className="font-mono">⌘⏎</span>{' '}
            publishes.
          </>
        )}
      </p>
    </header>
  );
}

function versionLine({
  hasDraft,
  published,
  isNew,
}: {
  hasDraft: boolean;
  published: boolean;
  isNew: boolean;
}): string {
  if (isNew) {
    return 'A new document. It exists nowhere until the first save writes a draft.';
  }
  if (hasDraft && published) {
    return 'Showing the draft, which differs from what is published. Readers still see the published version.';
  }
  if (hasDraft) {
    return 'Showing a draft that has never been published. Readers see nothing.';
  }
  if (published) {
    return 'Showing the published version. Editing it creates a draft beside it.';
  }
  return 'No draft and no published version — this document exists only in this tab.';
}

/** `Saving…`, `Saved`, `Unsaved changes`, or what went wrong. */
function SaveIndicator({
  state,
  savedAt,
  error,
}: {
  state: SaveState;
  savedAt: string | null;
  error: string | null;
}) {
  const tone =
    state === 'error'
      ? 'text-destructive'
      : state === 'dirty'
        ? 'text-warning'
        : state === 'saved'
          ? 'text-success'
          : 'text-muted-foreground';

  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? `Saved${savedAt ? ` ${relativeTime(savedAt)}` : ''}`
        : state === 'dirty'
          ? 'Unsaved changes'
          : state === 'error'
            ? (error ?? 'Could not save')
            : 'Nothing to save';

  return (
    <span className={cn('flex items-center gap-1.5 text-xs', tone)} title={error ?? label}>
      {state === 'saving' && <Loader2Icon className="size-3 animate-spin" />}
      {label}
    </span>
  );
}
