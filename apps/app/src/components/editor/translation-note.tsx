'use client';

import { CheckIcon, Loader2Icon, SparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AcharDocument } from '@achar/types';
import { Button } from '@achar/ui';
import { useAction } from '@/hooks/use-resource';
import { plural, relativeTime } from '@/lib/format';
import { languageName } from '@/lib/language';

/**
 * The translation lane: who wrote the language on screen, and whether anybody has
 * read it.
 *
 * A model may translate a document — `translateDocument` writes the values into
 * the **draft** — but a publish is refused while any language is marked `ai` and
 * unapproved, so a translation nobody has read is a draft nobody can ship. The
 * refusal comes from the API and names its languages; this is the screen that says
 * so first, above the fields it is about, with the two things a person can do about
 * it. A button that only exists once publishing has already failed is a button
 * nobody finds.
 *
 * **The record is read from the document the editor holds, never remembered here.**
 * Editing a language's values clears that language's approval at the API, so a copy
 * taken when a read landed would go on saying "approved" over words nobody has read
 * — and an approved-looking language that publishing refuses is the one situation
 * this lane exists to prevent.
 *
 * **Nothing here is a script's doing.** Approval is a person taking responsibility
 * for text they have read, and the API refuses a request carrying an API token with
 * `APPROVAL_REQUIRES_A_PERSON`; the wording below says the same thing, because a
 * button that read as automatable would be promising something the API will not do.
 */
export function TranslationNote({
  projectId,
  dataset,
  documentId,
  document,
  language,
  defaultLanguage,
  canEdit,
  dirty,
  onChanged,
}: {
  projectId: string;
  dataset: string;
  documentId: string;
  /** The row the editor holds: the draft when there is one, the published row otherwise. */
  document: AcharDocument | null;
  /** The language the fields below are shown in. */
  language: string;
  defaultLanguage: string;
  /** The caller may write content here. */
  canEdit: boolean;
  /** The form holds values the API has not been sent, which the next save would write. */
  dirty: boolean;
  /** Read the document again, after a call has written the draft. */
  onChanged: () => void;
}) {
  const translate = useAction(async (client, target: string) =>
    client.translateDocument(projectId, dataset, { id: documentId, language: target }),
  );
  const approve = useAction(async (client, target: string) =>
    client.approveTranslations(projectId, dataset, documentId, [target]),
  );

  const record = document?._translations?.[language] ?? null;
  const name = languageName(language);
  // One at a time: a translation and an approval are two writes to the same draft,
  // and a second press while the first is in flight would be answered by whichever
  // landed last rather than by what the person meant.
  const busy = translate.pending || approve.pending;
  // A dirty form holds both actions back, not only the one that writes words —
  // `SAVE_FIRST` is the reason, and it is on screen whenever this is true.
  const blocked = dirty;

  // Under the actions: why they cannot be pressed, and what the API said when one
  // of them failed — its own sentence, which for a deployment with no model names
  // the variable to set.
  const reasons = (
    <>
      {blocked && <p className="text-xs text-warning">{SAVE_FIRST}</p>}
      {translate.error && <p className="text-xs text-destructive">{translate.error}</p>}
      {approve.error && <p className="text-xs text-destructive">{approve.error}</p>}
    </>
  );

  async function runTranslate() {
    // One failure on screen at a time: an approval that was refused and then
    // replaced by a translation would otherwise sit there as if it were the answer.
    approve.reset();

    const result = await translate.run(language);
    if (!result) {
      toast.error(translate.error ?? 'Could not translate the document');
      return;
    }

    const written = result.fields.length;
    toast.success(`Translated into ${name}`, {
      description:
        written === 0
          ? 'There was nothing in this document to translate, so the draft is unchanged.'
          : `${plural(written, 'field')} written${
              result.skipped.length > 0
                ? `, ${plural(result.skipped.length, 'field')} left alone`
                : ''
            }. A model wrote them, so somebody has to read them before this can be published.`,
    });
    onChanged();
  }

  async function runApprove() {
    translate.reset();

    const approved = await approve.run(language);
    if (!approved) {
      toast.error(approve.error ?? 'Could not approve the translation');
      return;
    }

    toast.success(`${name} approved`, {
      description: 'You are recorded as the person who read these words, so publishing can go ahead.',
    });
    onChanged();
  }

  // A document that exists nowhere has nothing to translate: the API reads the row,
  // and the first save is what writes one.
  if (!document) return null;

  if (!record) {
    // The default language is not offered — a model translates *into* a language
    // from another one, and a document's own language is where the words already
    // are. A viewer gets nothing here either: the button is the whole of this state,
    // and the language switch beside it is what says how much is unwritten.
    if (language === defaultLanguage || !canEdit) return null;

    return (
      <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            No translation of {name} has been recorded. A model can draft one from{' '}
            {languageName(defaultLanguage)}, and whatever it writes waits for somebody to read it
            before this document can be published.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={blocked || busy}
            title={blocked ? 'Save the draft first' : undefined}
            onClick={() => void runTranslate()}
          >
            {translate.pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
            Translate into {name}
          </Button>
        </div>

        <div className="mt-2 space-y-1">{reasons}</div>
      </div>
    );
  }

  if (record.source === 'ai' && !record.approvedBy) {
    return (
      <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3">
        <div className="flex items-start gap-2">
          <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />

          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-xs text-foreground">
              A model wrote the {name} values
              {record.model ? (
                <>
                  {' — '}
                  <span className="font-mono">{record.model}</span>
                </>
              ) : null}
              , {relativeTime(record.at)}.
            </p>

            <p className="text-xs text-muted-foreground">
              Nobody has reviewed them yet, and publishing is blocked until somebody has. Approving
              is a person&rsquo;s act, not a script&rsquo;s — the API refuses an API token — and it
              records who gave it.
            </p>

            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={blocked || busy}
                  title={blocked ? 'Save the draft first' : 'Record that you have read these words'}
                  onClick={() => void runApprove()}
                >
                  {approve.pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
                  Approve translation
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={blocked || busy}
                  title={
                    blocked
                      ? 'Save the draft first'
                      : 'Ask the model for a fresh translation, replacing these values'
                  }
                  onClick={() => void runTranslate()}
                >
                  {translate.pending ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
                  Translate again
                </Button>
              </div>
            )}

            {reasons}
          </div>
        </div>
      </div>
    );
  }

  if (record.source === 'ai') {
    return (
      <div className="mb-4 rounded-lg border border-success/30 bg-success/10 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          A model wrote the {name} values
          {record.model ? (
            <>
              {' — '}
              <span className="font-mono">{record.model}</span>
            </>
          ) : null}
          , {relativeTime(record.at)}. Approved by{' '}
          <span className="font-mono">{record.approvedBy}</span>
          {record.approvedAt ? ` ${relativeTime(record.approvedAt)}` : ''}.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-4 rounded-lg border border-border bg-muted px-3 py-2">
      <p className="text-xs text-muted-foreground">
        A person wrote the {name} values. Nothing in this language came from a model, so there is
        nothing here to approve.
      </p>
    </div>
  );
}

/**
 * Why nothing in the lane can be pressed while the form has unsaved changes.
 *
 * Both calls are recorded on the draft at the API, and the save that followed would
 * send the values still in the form — the ones from before the translation — back
 * over the language the model just wrote. An approval is undone by that same save,
 * because what it covered is no longer what the row holds: approving here would be
 * signing a text the API does not have. The reason is on the screen rather than only
 * in each button's `title`, because a disabled button with no reason is a button
 * people press twice.
 */
const SAVE_FIRST =
  'Save the draft first. Both of these are written onto the draft, and the values still in this form would go back over it on the next save.';
