'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import type { SchemaType } from '@achar/types';
import type { SchemaIssue } from '@achar/schema';
import { Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@achar/ui';
import { fieldGroups, hasGroups, hasIssueAt, issuesAt, localizedFieldCount, visibleFields } from '@/lib/schema';
import { languageName } from '@/lib/language';
import { routes } from '@/lib/routes';
import { FieldControl } from '@/components/editor/field-controls';

/**
 * The form, drawn from the schema.
 *
 * There is no form in this app that was written for a type: the fields come from
 * `SchemaType.fields`, the tabs from the type's own `groups`, the labels from the
 * schema's titles, and the help text from its descriptions. A dataset authored
 * against a different model gets a different form without a line of code
 * changing — which is the whole point of a schema-driven studio, and the reason
 * this component knows nothing about posts.
 *
 * Read-only and hidden are honoured here rather than inside each control:
 * `hidden` means the field is not drawn at all, and a `readOnly` field is drawn
 * but not editable, because a value somebody may not change is still a value they
 * need to see to understand the document.
 */
export interface DocumentFormProps {
  type: SchemaType;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  issues: SchemaIssue[];
  readOnly: boolean;
  projectId: string;
  dataset: string;
  /**
   * A path the panel asked to be shown, from a click on a validation issue.
   * Handed down rather than reached for through the DOM by the panel, so that the
   * one component that owns the field elements is the one that scrolls to them.
   */
  focusPath?: string | null;
  /** The language the editor is on, for the fields that hold one value per language. */
  language: string;
  /** The dataset's default language: what a gap falls back to, in the API's own words. */
  defaultLanguage: string;
}

export function DocumentForm({
  type,
  value,
  onChange,
  issues,
  readOnly,
  projectId,
  dataset,
  focusPath,
  language,
  defaultLanguage,
}: DocumentFormProps) {
  const container = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => fieldGroups(type), [type]);
  const tabbed = hasGroups(type);

  useEffect(() => {
    if (!focusPath || !container.current) return;
    const target = container.current.querySelector(`[data-path="${CSS.escape(focusPath)}"]`);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const control = target.querySelector('input, textarea, select, button');
    if (control instanceof HTMLElement) control.focus({ preventScroll: true });
  }, [focusPath]);

  function setField(name: string, next: unknown) {
    onChange({ ...value, [name]: next });
  }

  const declared = new Set(visibleFields(type.fields).map((field) => field.name));
  const undeclared = Object.keys(value).filter(
    (key) => !key.startsWith('_') && !declared.has(key),
  );

  const rendered = (fields: typeof type.fields) =>
    fields.map((field) => {
      const fieldIssues = issuesAt(issues, field.name);
      return (
        <div key={field.name} className="relative">
          <FieldControl
            field={field}
            value={value[field.name]}
            onChange={(next) => setField(field.name, next)}
            document={value}
            path={field.name}
            readOnly={readOnly || field.readOnly === true}
            issues={issues}
            projectId={projectId}
            dataset={dataset}
            language={language}
            defaultLanguage={defaultLanguage}
          />

          {/* The message beside the field, so that an issue is read where it is
              fixed — the panel on the right is a summary, not the only copy. */}
          {fieldIssues.length > 0 && (
            <p className="mt-1 pl-1 text-xs text-destructive">
              {fieldIssues.map((issue) => issue.message).join('; ')}
            </p>
          )}
        </div>
      );
    });

  return (
    <div ref={container} className="space-y-6">
      {language !== defaultLanguage && (
        <LanguageLane type={type} language={language} schemaHref={routes.schema(projectId, dataset)} />
      )}

      {tabbed ? (
        <Tabs defaultValue={groups[0]?.name}>
          <TabsList>
            {groups.map((group) => (
              <TabsTrigger key={group.name} value={group.name}>
                {group.title}
                {group.fields.some((field) => hasIssueAt(issues, field.name)) && (
                  <span className="ml-1.5 size-1.5 rounded-full bg-destructive" aria-hidden />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          {groups.map((group) => (
            <TabsContent key={group.name} value={group.name} className="mt-4 grid gap-6">
              {rendered(group.fields)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="grid gap-6">{rendered(groups[0]?.fields ?? [])}</div>
      )}

      {undeclared.length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Fields the schema does not declare
            </h3>
            <p className="text-xs text-muted-foreground">
              This document carries {undeclared.length}{' '}
              {undeclared.length === 1 ? 'field' : 'fields'} the schema knows nothing about. Content
              is open, so they are kept as they are — a migration may write a field before its
              schema is published — but nothing here edits them.
            </p>
            <div className="grid gap-1 rounded-lg border border-dashed border-border bg-muted p-3">
              {undeclared.map((key) => (
                <p key={key} className="truncate font-mono text-xs text-muted-foreground">
                  {key}
                </p>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/**
 * What the language on screen means for the fields below it.
 *
 * **The one thing a form cannot show by itself.** A field holds a value per language
 * only when the schema says so — `Localized<string>`, or `localized: true` — and every
 * other field holds a single value that all languages share: same box, same label,
 * same everything, because the only difference between the two is a decision made on
 * the schema screen. So a person who switches to French and finds the fields still
 * full of English cannot tell "nothing here is translated yet" from "nothing here
 * *can* be translated" — and in the second case, typing into what they take for a
 * French title changes the title in every language.
 *
 * Drawn only for a language other than the default: the default language is the one a
 * document is written in first, and a note about it would be noise on the one screen
 * where nothing is surprising.
 */
function LanguageLane({
  type,
  language,
  schemaHref,
}: {
  type: SchemaType;
  language: string;
  /** Where a field is made translatable — the type's own schema screen. */
  schemaHref: string;
}) {
  const translated = useMemo(() => localizedFieldCount(type), [type]);

  if (translated === 0) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          Nothing in {type.title || type.name} holds a value per language.
        </span>{' '}
        Switching language changes nothing here: every field below is the same in all of them,
        including whatever is typed while this one is on screen. A field becomes translatable
        when the schema writes it as <span className="font-mono">Localized&lt;…&gt;</span> — which
        is a click on each field of{' '}
        <Link href={schemaHref} className="text-foreground underline">
          this type&rsquo;s schema
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      Editing <span className="font-medium text-foreground">{languageName(language)}</span>.{' '}
      {translated === 1 ? 'One field' : `${translated} fields`} of {type.title || type.name}{' '}
      {translated === 1 ? 'holds' : 'hold'} a value per language — each has a bar down its left
      side, and one this language has not been written in is an empty box. Every other field is
      shared by all of them.
    </div>
  );
}
