'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SchemaType } from '@achar/types';
import { Skeleton } from '@achar/ui';
import { initialDocument, validateDocument } from '@achar/schema';
import { useAcharClient } from '@/components/studio/client-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorNote } from '@/components/ui/empty-state';
import { DocumentForm } from '@/components/editor/document-form';
import { DocumentPreview } from '@/components/editor/document-preview';
import { InspectorPanel } from '@/components/editor/inspector-panel';
import { PublishBar, type SaveState } from '@/components/editor/publish-bar';
import { useDocumentPair } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/errors';
import { draftIdOf, routes } from '@/lib/routes';

/** How long typing pauses before the draft is written. */
const AUTOSAVE_MS = 1000;

/**
 * The document editor, where the two halves of the model meet.
 *
 * **Drafts and publishing.** A document is two rows: `drafts.<id>` and `<id>`.
 * Every keystroke here patches the *draft* — debounced, so a paragraph is one
 * write rather than two hundred — and the published row is only ever touched by
 * the Publish button, which calls `publishDocument` and moves the draft onto the
 * published id. `Unpublish` takes the published row away and leaves the draft,
 * which is where it goes. The consequence is the whole design: a reader keeps
 * getting what was published while somebody rewrites it, and nothing an editor
 * types can reach a reader by accident.
 *
 * **Validation never blocks a draft.** `validateDocument` runs on every value
 * and the issues are listed in the panel and marked on the fields, but the save
 * goes through anyway — a draft is a place for a half-written document, and
 * refusing to save one is refusing the thing drafts are for. Publishing is the
 * step that warns, because publishing is the step that has consequences.
 *
 * The bar at the top says which version is on screen, whether it is saved, and
 * what a reader would currently get. That bar is the product: everything else
 * here is a form.
 */
export function DocumentEditor({
  projectId,
  dataset,
  type,
  documentId,
  isNew,
  canEdit,
}: {
  projectId: string;
  dataset: string;
  type: SchemaType;
  documentId: string;
  isNew: boolean;
  canEdit: boolean;
}) {
  const client = useAcharClient();
  const pair = useDocumentPair(projectId, dataset, documentId, { skip: isNew });

  const [value, setValue] = useState<Record<string, unknown>>(() => initialDocument(type));
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('clean');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<'publish' | 'unpublish' | 'discard' | null>(null);

  // The newest value, for the save that is still in flight to compare against.
  const latestValue = useRef(value);
  latestValue.current = value;

  const draftId = draftIdOf(documentId);
  const shown = pair.data?.shown ?? null;
  const published = pair.data?.published ?? null;
  const hasDraft = pair.data?.hasDraft ?? false;
  // A draft that exists is a draft that differs: publishing clears it, so the
  // presence of one *is* the difference — plus whatever is typed and not yet
  // written, which is what `dirty` covers.
  const draftDiffers = hasDraft || dirty;

  const issues = useMemo(() => validateDocument(type, value), [type, value]);
  const title = useMemo(() => previewTitle(type, value), [type, value]);

  // The form is filled from the read, but never while somebody is typing: a
  // refetch that landed mid-sentence and reset the fields to the last saved
  // version would be worse than a stale form.
  useEffect(() => {
    if (dirty) return;
    const clean = shown ?? published;
    const next = clean ? contentOf(clean) : initialDocument(type);
    setValue({ ...initialDocument(type), ...next });
    setSaveState('clean');
  }, [shown, published, type, dirty]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    setSaveState('saving');

    // The value being written, held so that the reply can be compared against
    // what is on screen now: a save that took a second and a half while somebody
    // kept typing leaves unsaved work behind it, and a bar that said "Saved"
    // there would be lying about the exact thing it exists to report.
    const written = value;

    try {
      await client.mutate(projectId, dataset, {
        mutations: [
          // Creating the draft if it is missing, then patching it, is two
          // mutations in one ordered batch rather than a read-then-write: the
          // first save of a new document and the four-hundredth are the same
          // request, and neither can clobber a field it did not touch.
          { createIfNotExists: { _id: draftId, _type: type.name } },
          { patch: { id: draftId, set: contentOf(value) } },
        ],
        atomic: true,
      });

      const stillDirty = latestValue.current !== written;
      setDirty(stillDirty);
      setSaveError(null);
      setSaveState(stillDirty ? 'dirty' : 'saved');
      setSavedAt(new Date().toISOString());
      pair.refresh();
      return true;
    } catch (cause) {
      setSaveState('error');
      setSaveError(errorMessage(cause, 'Could not save the draft'));
      return false;
    }
  }, [canEdit, client, projectId, dataset, draftId, type.name, value, pair.refresh]);

  // Held in refs so the debounce and the keyboard shortcuts always call the
  // newest closure without re-registering listeners on every keystroke.
  const saveRef = useRef(saveDraft);
  saveRef.current = saveDraft;

  useEffect(() => {
    if (!dirty || !canEdit) return;
    const timer = setTimeout(() => {
      void saveRef.current();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, value, canEdit]);

  const publishRef = useRef<() => void>(() => undefined);

  const runPublish = useCallback(async () => {
    setBusy(true);
    setConfirming(null);
    try {
      // A publish reads the draft the API holds, so anything typed in the last
      // second has to be written first — otherwise the button would publish the
      // version from before the sentence somebody just finished.
      if (dirty) {
        const saved = await saveRef.current();
        if (!saved) {
          toast.error('The draft could not be saved, so nothing was published');
          return;
        }
      }

      await client.publishDocument(projectId, dataset, documentId);
      toast.success('Published', {
        description: 'The draft is gone and this version is what readers get.',
      });
      setDirty(false);
      setSaveState('clean');
      pair.refresh();
    } catch (cause) {
      toast.error(errorMessage(cause, 'Could not publish'));
    } finally {
      setBusy(false);
    }
  }, [client, projectId, dataset, documentId, dirty, pair.refresh]);

  const requestPublish = useCallback(() => {
    // Publishing with issues is allowed and warned about: the schema's rules are
    // for readers, and an editor may have a reason to publish a document whose
    // optional field is empty. What is not allowed is publishing one silently.
    if (issues.length > 0) {
      setConfirming('publish');
      return;
    }
    void runPublish();
  }, [issues.length, runPublish]);

  publishRef.current = requestPublish;

  const runUnpublish = useCallback(async () => {
    setBusy(true);
    setConfirming(null);
    try {
      await client.unpublishDocument(projectId, dataset, documentId);
      toast.success('Unpublished', { description: 'The draft is what is left.' });
      pair.refresh();
    } catch (cause) {
      toast.error(errorMessage(cause, 'Could not unpublish'));
    } finally {
      setBusy(false);
    }
  }, [client, projectId, dataset, documentId, pair.refresh]);

  const runDiscard = useCallback(async () => {
    setBusy(true);
    setConfirming(null);
    try {
      await client.discardDraft(projectId, dataset, documentId);
      toast.success('Draft discarded', {
        description: 'The form goes back to the published version.',
      });
      setDirty(false);
      pair.refresh();
    } catch (cause) {
      toast.error(errorMessage(cause, 'Could not discard the draft'));
    } finally {
      setBusy(false);
    }
  }, [client, projectId, dataset, documentId, pair.refresh]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key === 's') {
        event.preventDefault();
        void saveRef.current();
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        publishRef.current();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function edit(next: Record<string, unknown>) {
    setValue(next);
    setDirty(true);
    if (saveState !== 'saving') setSaveState('dirty');
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <PublishBar
          backHref={routes.content(projectId, dataset, type.name)}
          backLabel={type.title || type.name}
          title={title}
          typeName={type.name}
          saveState={saveState}
          savedAt={savedAt}
          error={saveError}
          hasDraft={hasDraft}
          published={published !== null}
          isNew={isNew && shown === null}
          canEdit={canEdit}
          busy={busy}
          previewOpen={previewOpen}
          onTogglePreview={() => setPreviewOpen((open) => !open)}
          onSave={() => void saveRef.current()}
          onPublish={requestPublish}
          onUnpublish={() => setConfirming('unpublish')}
          onDiscard={() => setConfirming('discard')}
        />

        <div className="mx-auto max-w-2xl px-6 py-6">
          {pair.error && <ErrorNote className="mb-4">{pair.error}</ErrorNote>}

          {!canEdit && (
            <p className="mb-4 rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              You are a viewer on this project. The document is drawn in full and nothing here
              changes it.
            </p>
          )}

          {pair.loading && !pair.data && !isNew ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-2/3 rounded-lg" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <DocumentForm
              type={type}
              value={value}
              onChange={edit}
              issues={issues}
              readOnly={!canEdit}
              projectId={projectId}
              dataset={dataset}
              focusPath={focusPath}
            />
          )}
        </div>
      </div>

      {previewOpen && (
        <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border bg-muted/40 p-5 xl:block">
          <p className="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
            As a reader sees it
          </p>
          <DocumentPreview type={type} value={value} />
        </aside>
      )}

      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-border bg-card p-4 lg:block">
        <InspectorPanel
          document={shown ?? published}
          issues={issues}
          hasDraft={hasDraft}
          published={published !== null}
          draftDiffers={draftDiffers}
          isNew={isNew && shown === null}
          publishedAt={published?._updatedAt ?? null}
          draftAt={shown?._updatedAt ?? null}
          onFocusIssue={(path) => setFocusPath(path)}
        />
      </aside>

      <ConfirmDialog
        open={confirming === 'publish'}
        onOpenChange={(open) => setConfirming(open ? 'publish' : null)}
        title="Publish with the schema's issues outstanding?"
        description={
          <>
            {issues.length} {issues.length === 1 ? 'field is' : 'fields are'} not what the schema
            asks for — {issues.map((issue) => `${issue.path} ${issue.message}`).join('; ')}. A draft
            may look like this; publishing puts it in front of readers.
          </>
        }
        confirmLabel="Publish anyway"
        pending={busy}
        onConfirm={() => void runPublish()}
      />

      <ConfirmDialog
        open={confirming === 'unpublish'}
        onOpenChange={(open) => setConfirming(open ? 'unpublish' : null)}
        title="Unpublish this document?"
        description="The published row is taken away, so readers stop being served it. The draft stays, and publishing puts it back."
        confirmLabel="Unpublish"
        pending={busy}
        onConfirm={() => void runUnpublish()}
      />

      <ConfirmDialog
        open={confirming === 'discard'}
        onOpenChange={(open) => setConfirming(open ? 'discard' : null)}
        title="Discard the draft?"
        description="The draft row is deleted and the form goes back to the published version. Anything typed since the last save is lost, and this cannot be undone."
        confirmLabel="Discard draft"
        pending={busy}
        onConfirm={() => void runDiscard()}
      />
    </div>
  );
}

/**
 * The document's fields without its system fields.
 *
 * `_id`, `_rev`, `_createdAt` and `_updatedAt` belong to the API: sending them
 * back in a patch would be a client asserting a revision it did not issue, and
 * the API's own rule is that a field beginning `_` is nobody's to declare.
 */
function contentOf(document: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(document)) {
    if (key.startsWith('_')) continue;
    out[key] = entry;
  }
  return out;
}

/** What the bar calls the document — the schema's own preview title, or the id. */
function previewTitle(type: SchemaType, value: Record<string, unknown>): string {
  const preview = type.preview;
  if (preview?.title) {
    const found = value[preview.title];
    if (typeof found === 'string' && found.trim()) return found;
  }
  const title = value.title;
  if (typeof title === 'string' && title.trim()) return title;
  const id = value._id;
  if (typeof id === 'string' && id) return id;
  return 'Untitled';
}
