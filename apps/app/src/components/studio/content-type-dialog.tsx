'use client';

import { useMemo, useState } from 'react';
import { CheckIcon, LanguagesIcon, Loader2Icon, SparklesIcon, WandSparklesIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  humanise,
  inferFields,
  parseTypeDeclaration,
  pascalCase,
  printTypeDeclaration,
} from '@achar/schema';
import type { CreateTypeBody } from '@achar/api';
import type { DatasetSchema, SchemaType } from '@achar/types';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn,
} from '@achar/ui';
import { TypeBadge } from '@/components/studio/badges';
import { useAction } from '@/hooks/use-resource';
import { ICON_NAMES, iconFor } from '@/lib/icons';

/**
 * Writing a content type: what it is called, what it looks like, and what it holds.
 *
 * The schema is TypeScript, and that is the whole of the form. A type is a
 * declaration — `type Post = { title: string; … }` — and the fields Achar stores
 * are read out of it by `@achar/schema`, so there is one thing to learn and one
 * place for it to be wrong. The alternative, a builder of dropdowns and add-field
 * buttons, is a second language for the one thing the person using this already
 * writes every day.
 *
 * **Pasting a sample is the way in for everybody else.** A JSON document — one, or
 * a list of them — becomes fields, and fields become the declaration above. Which
 * is why the two are tabs rather than two features: they are two ways to write the
 * same text, and the text is what gets saved.
 *
 * What is *not* editable here: a type's preview fields, its orderings and its
 * groups. Those are the parts of the stored schema this form does not speak for,
 * and a form that silently dropped them would rewrite somebody's schema behind
 * their back — so the API carries them across the write, which is the only place
 * that can do it against what is actually stored rather than against the copy this
 * screen loaded. See `addDatasetType`.
 */
export function ContentTypeDialog({
  schema,
  type,
  trigger,
  onSaved,
}: {
  schema: DatasetSchema;
  /** The type being edited. Nothing means a new one. */
  type?: SchemaType;
  trigger?: React.ReactNode;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(type?.title ?? '');
  const [icon, setIcon] = useState(type?.icon ?? 'FileText');
  const [kind, setKind] = useState<SchemaType['kind']>(type?.kind ?? 'document');
  const [source, setSource] = useState(() => (type ? printTypeDeclaration(type) : START));
  const [sample, setSample] = useState('');

  const parsed = useMemo(() => parseTypeDeclaration(source), [source]);
  const clean = parsed.issues.length === 0 && parsed.name.length > 0;

  const save = useAction(async (client, body: CreateTypeBody) =>
    client.createType(schema.projectId, schema.dataset, body),
  );

  function reset() {
    setTitle(type?.title ?? '');
    setIcon(type?.icon ?? 'FileText');
    setKind(type?.kind ?? 'document');
    setSource(type ? printTypeDeclaration(type) : START);
    setSample('');
    save.reset();
  }

  /**
   * One field, between a value per language and one shared value.
   *
   * The declaration is reprinted rather than edited in place, because the printer is
   * the parser's own inverse: what comes back is what Achar understood, spelled the
   * way Achar writes it. That is the same act as the sample tab's, and it is why the
   * two live here together — this form edits one text, by three routes.
   */
  function toggleLocalized(name: string) {
    setSource(
      printTypeDeclaration({
        name: parsed.name,
        title: parsed.title,
        kind,
        fields: parsed.fields.map((field) =>
          field.name === name ? { ...field, localized: field.localized !== true } : field,
        ),
      }),
    );
  }

  /**
   * The sample, read into the declaration.
   *
   * The JSON is parsed here rather than by the API because a paste is a local
   * act — nothing is stored until the type is saved — and because the failure it
   * produces most often is a stray comma, which the person pasting it can fix
   * while looking at it.
   */
  function generateFromSample() {
    let value: unknown;
    try {
      value = JSON.parse(sample);
    } catch (cause) {
      toast.error('That is not JSON', {
        description: cause instanceof Error ? cause.message : 'Check the sample and try again.',
      });
      return;
    }

    const inferred = inferFields(value);
    if (inferred.fields.length === 0) {
      toast.error('No fields in that sample', { description: inferred.notes.join(' ') });
      return;
    }

    const name = inferred.name || pascalCase(title.trim()) || 'Untitled';
    setSource(printTypeDeclaration({ name, title: title.trim() || humanise(name), kind, fields: inferred.fields }));
    if (!title.trim() && inferred.name) setTitle(humanise(inferred.name));

    toast.success(`${inferred.fields.length} fields read`, {
      description: inferred.notes.length > 0 ? inferred.notes.join(' ') : 'Nothing had to be guessed.',
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!clean || save.pending) return;

    // One type, and the name it is replacing when it is a rename — never the whole
    // array. A `types` list sent from here would be this screen's copy of a schema
    // somebody else may have added to since it loaded, and writing it back is how a
    // type gets lost.
    const saved = await save.run({
      name: parsed.name,
      title: title.trim() || parsed.title || humanise(parsed.name),
      kind,
      icon,
      fields: parsed.fields,
      ...(parsed.description ? { description: parsed.description } : {}),
      ...(type ? { replaces: type.name } : {}),
    });
    if (!saved) {
      toast.error(save.error ?? 'Could not save the schema');
      return;
    }

    toast.success(`${title.trim() || parsed.title || humanise(parsed.name)} saved`, {
      description: 'The studio is drawn from this now — every form and every list.',
    });
    setOpen(false);
    reset();
    onSaved();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <SparklesIcon />
            New content type
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{type ? `Edit ${type.title}` : 'New content type'}</DialogTitle>
          <DialogDescription>
            A content type is what a document is: its name, how the studio draws it, and the fields it
            holds — written as TypeScript, or read out of a sample of your data.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid min-w-56 flex-1 gap-2">
              <Label htmlFor="type-title">Title</Label>
              <Input
                id="type-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Blog post"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                What the studio calls it. Filed as{' '}
                <span className="font-mono">{parsed.name || '…'}</span>, which is the name your
                queries use.
              </p>
            </div>

            <div className="grid w-40 gap-2">
              <Label>Kind</Label>
              <Tabs value={kind} onValueChange={(next) => setKind(next === 'object' ? 'object' : 'document')}>
                <TabsList className="w-full">
                  <TabsTrigger value="document">Document</TabsTrigger>
                  <TabsTrigger value="object">Object</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-xs text-muted-foreground">
                {kind === 'document'
                  ? 'A thing somebody writes, lists and publishes.'
                  : 'Only ever a field of another type — an address, a link.'}
              </p>
            </div>

            <IconPicker value={icon} onChange={setIcon} />
          </div>

          <Tabs defaultValue="typescript">
            <TabsList>
              <TabsTrigger value="typescript">TypeScript</TabsTrigger>
              <TabsTrigger value="sample">Sample data</TabsTrigger>
            </TabsList>

            <TabsContent value="typescript" className="grid gap-2 pt-4">
              <Label htmlFor="type-source">Declaration</Label>
              <Textarea
                id="type-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                rows={14}
                spellCheck={false}
                className="font-mono text-xs leading-relaxed"
              />

              {parsed.issues.length > 0 ? (
                <ul className="grid gap-1 text-xs text-destructive">
                  {parsed.issues.map((issue) => (
                    <li key={`${issue.line}:${issue.column}:${issue.message}`} className="flex gap-2">
                      <span className="font-mono">
                        {issue.line}:{issue.column}
                      </span>
                      {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <ParsedFields
                  fields={parsed.fields}
                  kind={kind}
                  canToggle={clean}
                  onToggleLocalized={toggleLocalized}
                />
              )}
            </TabsContent>

            <TabsContent value="sample" className="grid gap-2 pt-4">
              <Label htmlFor="type-sample">A document, or a list of them</Label>
              <Textarea
                id="type-sample"
                value={sample}
                onChange={(event) => setSample(event.target.value)}
                rows={12}
                spellCheck={false}
                className="font-mono text-xs leading-relaxed"
                placeholder={'{\n  "title": "Hello world",\n  "publishedAt": "2026-03-01T09:00:00.000Z",\n  "tags": ["a", "b"]\n}'}
              />
              <p className="text-xs text-muted-foreground">
                Fields are read from it and written into the TypeScript beside this tab, where you can
                correct them — a sample cannot say that a string is a reference, or that a field is
                required only sometimes.
              </p>
              <div>
                <Button type="button" variant="outline" size="sm" onClick={generateFromSample} disabled={!sample.trim()}>
                  <WandSparklesIcon />
                  Generate types
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={save.pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!clean || save.pending}>
              {save.pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              {type ? 'Save type' : 'Create type'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The declaration this form starts from.
 *
 * A type with no fields in it is a form with nothing to fill in, so the editor
 * opens on the shape of the thing rather than on an empty box: what a person has
 * to do next is delete and rename lines, which is easier than remembering syntax.
 *
 * **And it shows the one distinction a document form cannot show.** `Localized<…>`
 * is a field that holds one value per language; everything else holds one value that
 * every language shares. Nothing in a filled-in form reveals which of the two a field
 * is — so somebody switches to French in the editor, finds the fields unchanged, and
 * concludes the translation is broken, when in fact they have just edited the title
 * in every language at once. The template therefore opens with one of each, saying
 * which is which.
 */
const START = `type Untitled = {
  /** Title, per language — Localized<…> is what makes a field translatable. */
  title: Localized<string>;
  /** Slug, one value — a URL segment is not prose, and every language shares it. */
  slug: string;
  /** Write the fields this document has. */
  body: Localized<text>;
}`;

/**
 * What Achar understood, so that the text and the schema are visibly the same thing.
 *
 * **The last chip is a button**, because "does this field hold one value per language"
 * is a decision about content, and `Localized<…>` is syntax nobody should have to know
 * to make it. Flipping one re-prints the declaration — the same round trip the sample
 * tab already performs, and the reason the parser and the printer are a pair — and it
 * is offered only while the text reads cleanly, since re-printing a half-understood
 * declaration would quietly drop the part Achar could not parse.
 */
function ParsedFields({
  fields,
  kind,
  canToggle,
  onToggleLocalized,
}: {
  fields: SchemaType['fields'];
  kind: SchemaType['kind'];
  canToggle: boolean;
  /** Flips one field between a value per language and a single shared value. */
  onToggleLocalized: (name: string) => void;
}) {
  if (fields.length === 0) {
    return <p className="text-xs text-muted-foreground">No fields yet — a document of this is only its id.</p>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map((field) => (
        <span
          key={field.name}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs"
        >
          <span className="font-mono text-foreground">{field.name}</span>
          <TypeBadge name={field.type} />
          {field.required === false && <span className="text-muted-foreground">optional</span>}

          <button
            type="button"
            aria-pressed={field.localized === true}
            disabled={!canToggle}
            onClick={() => onToggleLocalized(field.name)}
            title={
              !canToggle
                ? 'Achar has to be able to read the declaration before it can change it'
                : field.localized
                  ? 'One value per language. Click to make it one value shared by every language.'
                  : 'One value, shared by every language. Click to make it one value per language.'
            }
            className={cn(
              'inline-flex items-center gap-1 rounded px-1 transition-colors',
              field.localized
                ? 'bg-primary/10 font-medium text-primary'
                : 'text-muted-foreground hover:text-foreground',
              !canToggle && 'cursor-not-allowed opacity-60',
            )}
          >
            <LanguagesIcon className="size-3" />
            {field.localized ? 'translated' : 'one value'}
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * The icon, chosen from what the studio can draw.
 *
 * A grid rather than a text field: an icon name typed by hand is a name the map
 * may not know, and the fallback — a plain document — would look like a choice
 * somebody made rather than a typo nobody saw.
 */
function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const Selected = iconFor(value);

  return (
    <div className="grid gap-2">
      <Label>Icon</Label>
      <div className="flex items-start gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
          <Selected className="size-4" />
        </span>
        <div className="grid max-h-24 grid-cols-6 gap-0.5 overflow-y-auto pr-1 sm:grid-cols-8">
          {ICON_NAMES.map((name) => {
            const Icon = iconFor(name);
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={name}
                aria-pressed={name === value}
                onClick={() => onChange(name)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  name === value
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )}
              >
                <Icon className="size-3.5" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
