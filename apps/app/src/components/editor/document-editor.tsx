'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { SchemaType } from '@achar/types';
import { Skeleton } from '@achar/ui';
import {
  changedPaths,
  initialDocument,
  isLanguageMap,
  languageValue,
  resolveLanguages,
  validateDocument,
} from '@achar/schema';
import { useAcharClient } from '@/components/client-provider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorNote } from '@/components/ui/empty-state';
import { DocumentForm } from '@/components/editor/document-form';
import { DocumentPreview } from '@/components/editor/document-preview';
import { InspectorPanel } from '@/components/editor/inspector-panel';
import { LanguageSwitch } from '@/components/editor/language-switch';
import { PublishBar, type SaveState } from '@/components/editor/publish-bar';
import { TranslationNote } from '@/components/editor/translation-note';
import { DocumentHistoryDialog } from '@/components/studio/document-history-dialog';
import { useStudio } from '@/components/studio/studio-context';
import { useDocumentPair } from '@/hooks/use-documents';
import { errorMessage } from '@/lib/errors';
import { draftIdOf, routes } from '@/lib/routes';

/**
 * The document editor, where the two halves of the model meet.
 *
 * **Drafts and publishing.** A document is two rows: `drafts.<id>` and `<id>`.
 * Saving patches the *draft*; the published row is only ever touched by the
 * Publish button, which calls `publishDocument` and moves the draft onto the
 * published id. `Unpublish` takes the published row away and leaves the draft,
 * which is where it goes. The consequence is the whole design: a reader keeps
 * getting what was published while somebody rewrites it, and nothing an editor
 * types can reach a reader by accident.
 *
 * **Nothing is written until somebody says so.** There was a debounce here that
 * wrote the draft a second after typing stopped, and it is gone: a save is the
 * Save draft button, ⌘S, or Publish — which writes the draft first, because
 * publishing reads the row the API holds and a button that published the version
 * from before the last sentence would be publishing something nobody saw. So the
 * bar's "Unsaved changes" means what it says, and the browser is given a chance to
 * ask before a tab closes on unsaved work.
 *
 * **Validation never blocks a draft.** `validateDocument` runs on every value and
 * the issues are listed in the panel and marked on the fields, but a save goes
 * through anyway — a draft is a place for a half-written document, and refusing to
 * save one is refusing the thing drafts are for. Publishing is the step that
 * warns, because publishing is the step that has consequences.
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
  const { datasetInfo } = useStudio();

  /**
   * The languages this document is authored in, and the one on screen.
   *
   * From the dataset, because that is where a language list lives — and a dataset
   * the shell could not read is drawn as an English one rather than as nothing: the
   * editor has to draw *something*, and one language shows a document where no
   * language would show a form nobody could use.
   *
   * `chosen` is null until somebody switches, and the screen follows the dataset's
   * default until then. That is what makes adding French to a dataset, or changing
   * which language is the default, take effect in an editor that was already open.
   */
  const languages = useMemo(
    () =>
      datasetInfo?.languages?.length ? datasetInfo.languages : [datasetInfo?.defaultLanguage ?? 'en'],
    [datasetInfo],
  );
  const defaultLanguage = datasetInfo?.defaultLanguage ?? languages[0]!;
  const [chosen, setChosen] = useState<string | null>(null);
  const language = chosen && languages.includes(chosen) ? chosen : defaultLanguage;

  const [value, setValue] = useState<Record<string, unknown>>(() =>
    initialDocument(type, { defaultLanguage }),
  );
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

  const issues = useMemo(
    () => validateDocument(type, value, { defaultLanguage }),
    [type, value, defaultLanguage],
  );
  const title = useMemo(
    () => previewTitle(type, value, { language, defaultLanguage }),
    [type, value, language, defaultLanguage],
  );

  /**
   * How much of this document each language is missing.
   *
   * The same walk the API runs when it answers a read, asked once per language
   * instead of once for the one being read — so the number the switch shows and the
   * fallback a reader gets are one fact read twice, rather than two counters that
   * agree until somebody edits a schema.
   */
  const missing = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const code of languages) {
      counts[code] = resolveLanguages(type, value, { language: code, defaultLanguage }).untranslated
        .length;
    }
    return counts;
  }, [languages, type, value, defaultLanguage]);

  /**
   * The languages a model wrote that nobody has approved, by code.
   *
   * Read off the row the editor holds rather than remembered as actions happen, and
   * for the reason the lane below reads it there too: editing a language's values
   * clears that language's approval at the API, so an approved language can go back
   * to unapproved without anybody pressing anything. Publish is refused while any of
   * these stands, which is why the switch marks them where the languages are chosen.
   */
  const unapproved = useMemo(() => {
    const codes: Record<string, boolean> = {};
    for (const [code, entry] of Object.entries(shown?._translations ?? {})) {
      if (entry.source === 'ai' && !entry.approvedBy) codes[code] = true;
    }
    return codes;
  }, [shown]);

  // The form is filled from the read, but never while somebody is typing: a
  // refetch that landed mid-sentence and reset the fields to the last saved
  // version would be worse than a stale form.
  useEffect(() => {
    if (dirty) return;
    const clean = shown ?? published;
    const next = clean ? contentOf(clean) : initialDocument(type, { defaultLanguage });
    setValue({ ...initialDocument(type, { defaultLanguage }), ...next });
    setSaveState('clean');
  }, [shown, published, type, dirty, defaultLanguage]);

  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!canEdit) return false;
    setSaveState('saving');

    // The value being written, held so that the reply can be compared against
    // what is on screen now: a save that took a second and a half while somebody
    // kept typing leaves unsaved work behind it, and a bar that said "Saved"
    // there would be lying about the exact thing it exists to report.
    const written = value;

    /**
     * **What changed, grouped by the language it changed in.**
     *
     * The save used to send the whole document back, and that is what made editing one
     * language change another: a patch *replaces* the value at the path it names, so
     * `set: { title: { en: "…", fr: "…" } }` replaced the English value with whatever
     * copy this form happened to be holding — a stale one, or none at all — while the
     * person was only editing the French. Writing the difference, one language at a
     * time and naming the language, means a save can only reach the language that was
     * edited. See `changedPaths`.
     *
     * The comparison is against the document this form was filled from, so what is
     * written is exactly what the person changed — not what the table holds now, which
     * they have never seen.
     */
    const loaded = shown ?? published;
    const changes = changedPaths(type, value, loaded ? contentOf(loaded) : null);

    const patches = [
      ...changes.languages.map((entry) => ({
        patch: {
          id: draftId,
          set: entry.set,
          ...(entry.unset.length > 0 ? { unset: entry.unset } : {}),
          // The one field that keeps this patch out of every other language.
          _language: entry.language,
        },
      })),
      ...(Object.keys(changes.shared.set).length > 0 || changes.shared.unset.length > 0
        ? [
            {
              patch: {
                id: draftId,
                set: changes.shared.set,
                ...(changes.shared.unset.length > 0 ? { unset: changes.shared.unset } : {}),
              },
            },
          ]
        : []),
    ];

    // Nothing to write: a form that was edited and edited back is not a write, and a
    // document that already has a draft does not need one made for it.
    if (patches.length === 0 && (shown !== null || published !== null)) {
      setDirty(false);
      setSaveState('saved');
      setSavedAt(new Date().toISOString());
      return true;
    }

    try {
      await client.mutate(projectId, dataset, {
        mutations: [
          // A document that is in neither row is created first, and only then: on a
          // document that already has the published row, making an *empty* draft would
          // throw its content away — the patch is what builds the draft from it.
          ...(shown === null && published === null
            ? [{ createIfNotExists: { _id: draftId, _type: type.name } }]
            : []),
          ...patches,
        ],
        /**
         * **The language this save is in, said once for the whole batch.**
         *
         * Every patch above that writes a language names it itself, and that is what
         * keeps one language out of another. This is the second lock on the same door,
         * and it is the one that holds when a patch does *not* name one: the API reads a
         * plain value with no language as the **default** language, so a French title
         * written without a marker becomes the English one — and because a read falls
         * back from French to English, the person then sees their French in both lanes.
         * That is the whole bug this line exists to prevent, and it is explained where
         * the API applies it: `withLanguage`.
         *
         * The language on screen rather than the document's: it is the one the person is
         * typing in, and it is the one a value with no marker of its own is in.
         */
        language,
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
  }, [
    canEdit,
    client,
    projectId,
    dataset,
    draftId,
    type,
    value,
    language,
    pair.refresh,
    shown,
    published,
  ]);

  // Held in a ref so the keyboard shortcuts — and the publish that saves first —
  // always call the newest closure without re-registering listeners.
  const saveRef = useRef(saveDraft);
  saveRef.current = saveDraft;

  /**
   * A last word before the tab goes, when there is something unwritten.
   *
   * Nothing here saves by itself any more, so the one thing that can lose work is
   * closing the page with the form dirty — and this is the browser's own warning
   * rather than a dialog of ours, because by the time it fires the decision is
   * already the browser's. It is **not** a save: dismissing it keeps the work
   * unsaved, which is the point.
   *
   * It cannot see a navigation inside the studio — a rail link is a client-side
   * route change, and the browser never asks about those. The bar's own
   * "Unsaved changes" is what says so before somebody clicks away.
   */
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
          languageSwitch={
            <LanguageSwitch
              languages={languages}
              defaultLanguage={defaultLanguage}
              value={language}
              missing={missing}
              unapproved={unapproved}
              onChange={setChosen}
            />
          }
          history={
            // Restoring writes the draft, so the editor drops whatever it was
            // holding and reads the restored row: the refill effect only runs for
            // a form that is not dirty, which is why `dirty` is cleared first.
            <DocumentHistoryDialog
              projectId={projectId}
              dataset={dataset}
              documentId={documentId}
              type={type}
              canEdit={canEdit}
              onRestored={() => {
                setDirty(false);
                setSaveState('clean');
                pair.refresh();
              }}
            />
          }
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

          <TranslationNote
            projectId={projectId}
            dataset={dataset}
            documentId={documentId}
            document={shown ?? published}
            language={language}
            defaultLanguage={defaultLanguage}
            canEdit={canEdit}
            dirty={dirty}
            onChanged={() => {
              // A translation and an approval both write the draft, so the row is read
              // again rather than patched here. Unlike a restore, `dirty` is not
              // cleared first: the lane's buttons are off while the form is dirty, so
              // there is nothing of the person's own for this refill to overwrite —
              // which is exactly what lets the effect above take the new document.
              pair.refresh();
            }}
          />

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
              language={language}
              defaultLanguage={defaultLanguage}
            />
          )}
        </div>
      </div>

      {previewOpen && (
        <aside className="hidden w-96 shrink-0 overflow-y-auto border-l border-border bg-muted/40 p-5 xl:block">
          <p className="mb-4 text-xs uppercase tracking-wide text-muted-foreground">
            As a reader sees it
          </p>
          <DocumentPreview
            type={type}
            value={value}
            language={language}
            defaultLanguage={defaultLanguage}
          />
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

/**
 * What the bar calls the document — the schema's own preview title, or the id.
 *
 * Read in the language on screen: a translated title is a map of languages, and a
 * bar that asked a map for a string would call every translated document
 * "Untitled" — a worse answer than the id it already falls back to. An object where
 * a title belongs is a map, which is the one thing this needs to know and the
 * schema's job to be sure of.
 */
function previewTitle(
  type: SchemaType,
  value: Record<string, unknown>,
  languages: { language: string; defaultLanguage: string },
): string {
  const read = (path: string): unknown => {
    const found = value[path];
    if (!isLanguageMap(found)) return found;
    return languageValue(found, languages.language, languages.defaultLanguage).value;
  };

  const preview = type.preview;
  if (preview?.title) {
    const found = read(preview.title);
    if (typeof found === 'string' && found.trim()) return found;
  }
  const title = read('title');
  if (typeof title === 'string' && title.trim()) return title;
  const id = value._id;
  if (typeof id === 'string' && id) return id;
  return 'Untitled';
}
