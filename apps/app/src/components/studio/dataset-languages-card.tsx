'use client';

import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateDatasetBody } from '@achar/api';
import type { Dataset } from '@achar/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@achar/ui';
import { ToneBadge } from '@/components/studio/badges';
import { AddLanguageDialog } from '@/components/studio/add-language-dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ReadOnlyNote } from '@/components/ui/empty-state';
import { useAction } from '@/hooks/use-resource';
import { languageName } from '@/lib/language';

/**
 * The languages this dataset may be authored in, and which one answers by default.
 *
 * It is drawn here, on the dataset, because that is where the API keeps the list: a
 * document does not decide which languages it may hold, the body of content it
 * belongs to does, and one dataset translated into Spanish says nothing about the
 * next one.
 *
 * **A write here carries the whole list**, because the route replaces it whole — a
 * request naming only the language it was adding would read as "these are the
 * languages, and there is one". The default is the exception: it is a single code
 * the server checks against the list it already has, and sending a list along with
 * it would write back one read a moment ago, undoing whatever somebody else changed
 * in between.
 *
 * Removing a language is therefore *only* a removal. The values written in it stay
 * on the documents and stop being readable — including from a query that names it —
 * until the language is added back, which is what the confirmation says before
 * anything is written.
 */
export function DatasetLanguagesCard({
  dataset,
  canEdit,
  onChanged,
}: {
  dataset: Dataset;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const change = useAction(async (client, body: UpdateDatasetBody) =>
    client.updateDataset(dataset.projectId, dataset.datasetName, body),
  );

  async function makeDefault(code: string) {
    const updated = await change.run({ defaultLanguage: code });
    if (!updated) {
      toast.error(change.error ?? 'Could not change the default language');
      return;
    }

    toast.success(`${languageName(code)} is the default now`);
    onChanged();
  }

  async function remove(code: string): Promise<boolean> {
    const updated = await change.run({
      languages: dataset.languages.filter((known) => known !== code),
    });
    if (!updated) {
      toast.error(change.error ?? 'Could not remove the language');
      return false;
    }

    toast.success(`${languageName(code)} removed`, {
      description:
        'The content written in it is not deleted — it stops being readable until the language is added back.',
    });
    onChanged();
    return true;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Languages</CardTitle>
          <CardDescription>
            What content in this dataset may be written in. The default is the language a value with
            no translation of its own is answered in.
          </CardDescription>
        </div>
        {canEdit && <AddLanguageDialog dataset={dataset} onAdded={onChanged} />}
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {dataset.languages.map((code) => (
            <LanguageRow
              key={code}
              code={code}
              isDefault={code === dataset.defaultLanguage}
              canEdit={canEdit}
              canRemove={dataset.languages.length > 1}
              pending={change.pending}
              onMakeDefault={() => void makeDefault(code)}
              onRemove={() => remove(code)}
            />
          ))}
        </div>

        {canEdit ? (
          <p className="text-xs text-muted-foreground">
            Removing a language does not delete the content written in it — those values stop being
            readable until the language is added back. A dataset always keeps at least one, so the
            last of them cannot be removed.
          </p>
        ) : (
          <ReadOnlyNote>
            Only an editor of this project can change the languages this dataset is authored in.
          </ReadOnlyNote>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One language: how it reads, the code it is stored under, and the two things that
 * can be done to it.
 *
 * The code is beside the name rather than instead of it because it is the half that
 * is used elsewhere — it keys a document's values and it is what a query sends — and
 * a person who has only ever seen "Brazilian Portuguese" has no way to write the
 * request for it.
 */
function LanguageRow({
  code,
  isDefault,
  canEdit,
  canRemove,
  pending,
  onMakeDefault,
  onRemove,
}: {
  code: string;
  isDefault: boolean;
  canEdit: boolean;
  canRemove: boolean;
  pending: boolean;
  onMakeDefault: () => void;
  onRemove: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const name = languageName(code);

  async function confirm() {
    if (await onRemove()) setConfirming(false);
  }

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{name}</p>
          <ToneBadge tone="neutral" className="font-mono">
            {code}
          </ToneBadge>
          {isDefault && <ToneBadge tone="accent">Default</ToneBadge>}
        </div>

        {canEdit && !isDefault && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onMakeDefault}>
            Make default
          </Button>
        )}

        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pending || !canRemove}
            onClick={() => setConfirming(true)}
            aria-label={`Remove ${name}`}
            title={canRemove ? undefined : 'A dataset always has at least one language'}
          >
            <Trash2Icon className="text-destructive" />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove ${name}?`}
        description={
          <>
            The content written in {name} is not deleted — those values stay on the documents and
            leave every read until the language is added back. A query asking for it is refused
            rather than answered in the default language.
          </>
        }
        confirmLabel="Remove language"
        onConfirm={() => void confirm()}
        pending={pending}
      />
    </>
  );
}
