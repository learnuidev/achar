'use client';

import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea, cn } from '@achar/ui';
import { SparklesIcon } from 'lucide-react';
import type { PortableText, SchemaField } from '@achar/types';
import type { SchemaIssue } from '@achar/schema';
import { isLanguageMap, languageValue, setLanguageValue, slugify } from '@achar/schema';
import { hasIssueAt } from '@/lib/schema';
import { languageName } from '@/lib/language';
import { toDateInput, toDateTimeLocal } from '@/lib/format';
import { AssetField } from '@/components/editor/asset-field';
import { ArrayField } from '@/components/editor/array-field';
import { ReferenceField } from '@/components/editor/reference-picker';
import { PortableTextEditor } from '@/components/editor/portable-text-editor';

/**
 * One control per field type, and the dispatch between them.
 *
 * The schema names a `SchemaFieldType` and this file turns it into something a
 * person can type into — which is the whole claim the studio makes. Every type
 * the DSL declares has a case here, including the two that are containers: an
 * `array` is a repeatable list of one field, and an `object` is a fieldset of
 * several. There is deliberately no default branch that falls back to a text
 * input, because a type that silently became a string is a type whose documents
 * are saved wrong; `never` in the switch is what keeps this file honest when the
 * DSL grows a type.
 *
 * Nothing here validates. Issues arrive from `validateDocument` and are marked,
 * not enforced: a draft is a place for a half-written document.
 *
 * **A localized field is the same control, one language at a time.** The editor is
 * on one language, and `FieldControl` hands the control that language's value and
 * writes the answer back into the map — so every control in this file stays a
 * control for *one* value and none of them has to know that languages exist. The
 * alternative, a control per language inside every field, is a form nobody can read
 * at two languages and nobody can use at six.
 */
export interface FieldControlProps {
  field: SchemaField;
  value: unknown;
  onChange: (next: unknown) => void;
  /**
   * The whole document, so a control can reach a sibling — a slug generated from
   * a title is the only reason any control needs one, and threading a single
   * `title` prop through every nested field would be worse.
   */
  document: Record<string, unknown>;
  /** The dotted path this value sits at, matching the validator's own paths. */
  path: string;
  readOnly: boolean;
  issues: SchemaIssue[];
  projectId: string;
  dataset: string;
  /** The language the editor is on. Only a localized field ever reads it. */
  language: string;
  /** The dataset's default language: whose value a reader is shown for a gap. */
  defaultLanguage: string;
}

export function FieldControl(props: FieldControlProps) {
  if (props.field.localized) return <LocalizedControl {...props} />;
  return <FieldControlBody {...props} />;
}

/**
 * A field that holds one value per language, in the language the editor is on.
 *
 * **Empty means untranslated, and the hint says what that costs.** An editor who
 * typed nothing in French sees a reader still gets English — the API falls back to
 * the default language and reports it — and a box that looked the same whether the
 * site had a translation or not is how a site ships with three English sentences in
 * the middle of a French page.
 *
 * A value written before the field was localized is the default language's, which
 * is the same rule the API applies, so opening an old document and typing in French
 * leaves the prose it already had exactly where a reader has been finding it.
 */
function LocalizedControl({
  field,
  value,
  onChange,
  language,
  defaultLanguage,
  ...rest
}: FieldControlProps) {
  const own = isLanguageMap(value)
    ? value[language]
    : language === defaultLanguage
      ? value
      : undefined;
  const fallback = languageValue(value, defaultLanguage, defaultLanguage).value;
  const missing = own === undefined || own === null;
  const borrows =
    missing && language !== defaultLanguage && fallback !== undefined && fallback !== null;

  return (
    <div className="grid gap-1">
      <FieldControlBody
        {...rest}
        field={{ ...field, localized: false }}
        value={own}
        onChange={(next) => onChange(setLanguageValue(value, language, next, defaultLanguage))}
        language={language}
        defaultLanguage={defaultLanguage}
      />

      {borrows ? (
        <p className="px-1 text-xs text-muted-foreground">
          Not written in {languageName(language)} yet, so a reader is shown the{' '}
          {languageName(defaultLanguage)} one.
        </p>
      ) : null}
    </div>
  );
}

function FieldControlBody(props: FieldControlProps) {
  const { field, readOnly } = props;
  const invalid = hasIssueAt(props.issues, props.path);

  switch (field.type) {
    case 'string':
      // A closed set of values is a picker, not a text input with a rule
      // somewhere else: the schema already knows the answers.
      return field.options && field.options.length > 0 ? (
        <OptionControl {...props} invalid={invalid} />
      ) : (
        <ScalarControl {...props} type="text" invalid={invalid} />
      );
    case 'text':
      return <TextControl {...props} invalid={invalid} />;
    case 'number':
      return <ScalarControl {...props} type="number" invalid={invalid} />;
    case 'boolean':
      return <BooleanControl {...props} />;
    case 'datetime':
      return <ScalarControl {...props} type="datetime-local" invalid={invalid} />;
    case 'date':
      return <ScalarControl {...props} type="date" invalid={invalid} />;
    case 'slug':
      return <SlugControl {...props} invalid={invalid} />;
    case 'url':
      return <ScalarControl {...props} type="url" invalid={invalid} />;
    case 'email':
      return <ScalarControl {...props} type="email" invalid={invalid} />;
    case 'image':
    case 'video':
    case 'file':
      return <AssetField {...props} />;
    case 'reference':
      return <ReferenceField {...props} />;
    case 'portableText':
      return <PortableTextControl {...props} />;
    case 'array':
      return <ArrayField {...props} />;
    case 'object':
      return <ObjectControl {...props} />;
  }

  // Unreachable while the DSL's union is exhaustive; a new field type stops
  // compiling here rather than quietly drawing an input nobody can save from.
  const exhaustive: never = field.type;
  return <p className="text-sm text-destructive">Unsupported field type {String(exhaustive)}</p>;
}

/** The frame every control wears: a label, the control, and what the schema says about it. */
export function FieldShell({
  field,
  path,
  invalid,
  readOnly,
  children,
  inline,
}: {
  field: SchemaField;
  path: string;
  invalid: boolean;
  readOnly: boolean;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <div
      className={cn(
        'grid gap-1.5 rounded-lg px-1 py-0.5',
        invalid && 'bg-destructive/5 ring-1 ring-destructive/30',
      )}
      data-path={path}
    >
      <div className={cn('flex items-center gap-2', inline && 'justify-between')}>
        <Label htmlFor={path} className="flex items-center gap-1.5">
          {field.title || field.name}
          {field.required && (
            <span className="text-destructive" title="Required">
              *
            </span>
          )}
          {readOnly && (
            <span className="text-xs font-normal text-muted-foreground">read-only</span>
          )}
        </Label>
      </div>

      {children}

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
}

/** `string`, `number`, `url`, `email`, and the two date types. */
function ScalarControl({
  field,
  value,
  onChange,
  path,
  readOnly,
  issues,
  type,
  invalid,
}: FieldControlProps & { type: string; invalid: boolean }) {
  const asText =
    value === null || value === undefined
      ? ''
      : field.type === 'datetime'
        ? toDateTimeLocal(String(value))
        : field.type === 'date'
          ? toDateInput(String(value))
          : String(value);

  function commit(next: string) {
    if (field.type === 'number') {
      // An empty number is `null` rather than `0`: a required number that is
      // absent must read as absent, and a zero somebody did not type is a value
      // this form would have invented.
      onChange(next === '' ? null : Number(next));
      return;
    }
    if (field.type === 'datetime' || field.type === 'date') {
      onChange(next === '' ? '' : new Date(next).toISOString());
      return;
    }
    onChange(next);
  }

  return (
    <FieldShell field={field} path={path} invalid={invalid} readOnly={readOnly}>
      <Input
        id={path}
        type={type}
        value={asText}
        disabled={readOnly}
        placeholder={field.placeholder}
        min={field.min}
        max={field.max}
        onChange={(event) => commit(event.target.value)}
      />
    </FieldShell>
  );
}

function TextControl({ field, value, onChange, path, readOnly, invalid }: FieldControlProps & { invalid: boolean }) {
  return (
    <FieldShell field={field} path={path} invalid={invalid} readOnly={readOnly}>
      <Textarea
        id={path}
        rows={field.rows ?? 4}
        value={typeof value === 'string' ? value : ''}
        disabled={readOnly}
        placeholder={field.placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </FieldShell>
  );
}

function OptionControl({ field, value, onChange, path, readOnly, invalid }: FieldControlProps & { invalid: boolean }) {
  const options = field.options ?? [];
  const current = typeof value === 'string' ? value : '';

  return (
    <FieldShell field={field} path={path} invalid={invalid} readOnly={readOnly}>
      <Select
        value={current}
        onValueChange={(next) => onChange(next)}
        disabled={readOnly}
      >
        <SelectTrigger id={path}>
          <SelectValue placeholder={field.placeholder ?? 'Choose one'} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldShell>
  );
}

function BooleanControl({ field, value, onChange, path, readOnly, issues }: FieldControlProps) {
  const checked = value === true;
  const invalid = hasIssueAt(issues, path);

  return (
    <FieldShell field={field} path={path} invalid={invalid} readOnly={readOnly} inline>
      <div className="flex items-center gap-2">
        <Switch
          id={path}
          checked={checked}
          disabled={readOnly}
          onCheckedChange={(next) => onChange(next)}
        />
        <span className="text-xs text-muted-foreground">{checked ? 'On' : 'Off'}</span>
      </div>
    </FieldShell>
  );
}

/**
 * A slug, and the button that writes it.
 *
 * The generator reads the document's own `title`, which is the field a slug is
 * derived from in every schema anybody writes, and it is a button rather than an
 * automatic write because a slug is a URL that may already be published: a
 * studio that rewrote it every time somebody touched the title would break links
 * while its author was still typing.
 */
function SlugControl({
  field,
  value,
  onChange,
  document,
  path,
  readOnly,
  invalid,
}: FieldControlProps & { invalid: boolean }) {
  const title = document.title;
  const source = typeof title === 'string' && title.trim() ? title : '';

  return (
    <FieldShell field={field} path={path} invalid={invalid} readOnly={readOnly}>
      <div className="flex items-center gap-2">
        <Input
          id={path}
          value={typeof value === 'string' ? value : ''}
          disabled={readOnly}
          placeholder={field.placeholder ?? 'url-segment'}
          className="font-mono text-sm"
          onChange={(event) => onChange(slugify(event.target.value))}
        />
        <button
          type="button"
          disabled={readOnly || !source}
          onClick={() => onChange(slugify(source))}
          title={source ? `Generate from “${source}”` : 'There is no title to generate from'}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors',
            'hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent',
          )}
        >
          <SparklesIcon className="size-3.5" />
          Generate from title
        </button>
      </div>
    </FieldShell>
  );
}

/** Rich text, which is its own editor rather than a textarea. */
function PortableTextControl({
  field,
  value,
  onChange,
  path,
  readOnly,
  issues,
  invalid,
}: FieldControlProps & { invalid?: boolean }) {
  const text: PortableText = Array.isArray(value) ? (value as PortableText) : [];

  return (
    <FieldShell field={field} path={path} invalid={invalid ?? hasIssueAt(issues, path)} readOnly={readOnly}>
      <PortableTextEditor
        value={text}
        onChange={(next) => onChange(next)}
        readOnly={readOnly}
        rows={field.rows}
        placeholder={field.placeholder}
      />
    </FieldShell>
  );
}

/**
 * An object field: a fieldset that recurses into its own fields.
 *
 * Rendered as a bordered group rather than as a page of its own, because an
 * object is a shape *inside* a document — the studio has no screen for one, and
 * the recursion stops where the schema's does.
 */
function ObjectControl({
  field,
  value,
  onChange,
  document,
  path,
  readOnly,
  issues,
  projectId,
  dataset,
  language,
  defaultLanguage,
}: FieldControlProps) {
  const nested = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const fields = (field.fields ?? []).filter((candidate) => !candidate.hidden);

  function setNested(name: string, next: unknown) {
    onChange({ ...nested, [name]: next });
  }

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {field.title || field.name}
      </p>

      {fields.map((nestedField) => (
        <FieldControl
          key={nestedField.name}
          field={nestedField}
          value={nested[nestedField.name]}
          onChange={(next) => setNested(nestedField.name, next)}
          document={nested}
          path={`${path}.${nestedField.name}`}
          readOnly={readOnly}
          issues={issues}
          projectId={projectId}
          dataset={dataset}
          language={language}
          defaultLanguage={defaultLanguage}
        />
      ))}
    </div>
  );
}
