'use client';

import { useEffect, useState } from 'react';
import { Loader2Icon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { UpdateDatasetBody } from '@achar/api';
import type { Dataset } from '@achar/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@achar/ui';
import { useAction } from '@/hooks/use-resource';
import { LANGUAGE_SUGGESTIONS, languageName } from '@/lib/language';

/**
 * Adding one language to a dataset.
 *
 * Two ways to name a language, because neither answers for the other: buttons for
 * the ones nearly every dataset starts with, and a field for everything else. The
 * field is the half that cannot be dropped — the API accepts any `xx` / `xx-YY`
 * code, and a studio that only offered a list would be a studio that refuses
 * somebody's language.
 *
 * A button fills the field rather than writing on the click, so both ways end at
 * the same confirmation and the code about to be stored is visible before it is.
 * The dialog stays open afterwards for the same reason a language is rarely added
 * alone: a site is translated into three languages, not one.
 */
export function AddLanguageDialog({ dataset, onAdded }: { dataset: Dataset; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');

  // The list this dialog has already written, until the card's copy of the row comes
  // back from the shell's read. `languages` is written whole — see the card — so a
  // second add inside that window would send the list from before the first one and
  // quietly undo it.
  const [written, setWritten] = useState<string[] | null>(null);

  // A fresh list from the API is the truth, and the echo above is only there until
  // it arrives.
  useEffect(() => setWritten(null), [dataset.languages]);

  const current = written ?? dataset.languages;

  const add = useAction(async (client, language: string) => {
    const body: UpdateDatasetBody = { languages: [...current, language] };
    return client.updateDataset(dataset.projectId, dataset.datasetName, body);
  });

  const trimmed = code.trim();
  const alreadyThere = current.some((known) => known.toLowerCase() === trimmed.toLowerCase());
  const name = trimmed ? languageName(trimmed) : '';
  const canSubmit = trimmed.length > 0 && !alreadyThere && !add.pending;

  const offered = LANGUAGE_SUGGESTIONS.filter(
    (suggestion) => !current.some((known) => known.toLowerCase() === suggestion.toLowerCase()),
  );

  // Radix only reports a close it made itself — Escape, the overlay, the trigger — so the
  // button below comes through here as well: a control that set `open` directly would
  // leave the field, and any failure, on screen for the next time the dialog is opened.
  function close() {
    setOpen(false);
    setCode('');
    add.reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const language = trimmed;
    const updated = await add.run(language);
    if (!updated) {
      toast.error(add.error ?? 'Could not add the language');
      return;
    }

    setWritten(updated.languages);
    setCode('');
    toast.success(`${languageName(language)} added`, {
      description:
        'Nothing is translated by adding it — a document with no value in it is still answered in the default language.',
    });
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          Add language
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a language</DialogTitle>
          <DialogDescription>
            One more language the content here may be authored in. Existing documents keep what they
            have — adding a language translates nothing.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="language-code">Language</Label>

            {offered.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {offered.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    size="sm"
                    variant={suggestion === trimmed ? 'default' : 'outline'}
                    disabled={add.pending}
                    onClick={() => setCode(suggestion)}
                  >
                    {languageName(suggestion)}
                  </Button>
                ))}
              </div>
            )}

            <Input
              id="language-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="pt-BR"
              autoComplete="off"
            />

            {alreadyThere ? (
              <p className="text-xs text-warning">
                {name} is already one of this dataset&rsquo;s languages.
              </p>
            ) : trimmed ? (
              <p className="text-xs text-muted-foreground">
                Stored as <span className="font-mono">{trimmed}</span>
                {name === trimmed ? '' : ` — ${name}`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Any code will do: <span className="font-mono">pt-PT</span>,{' '}
                <span className="font-mono">es-419</span>, or one the buttons do not offer. It is
                stored as it is written — the API checks the shape of a code, not that the language
                exists.
              </p>
            )}
          </div>

          {add.error && <p className="text-sm text-destructive">{add.error}</p>}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Done
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {add.pending ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
              Add language
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
