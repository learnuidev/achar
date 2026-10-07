'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { SchemaType } from '@achar/types';
import type { SchemaIssue } from '@achar/schema';
import { Separator, Tabs, TabsContent, TabsList, TabsTrigger } from '@achar/ui';
import { fieldGroups, hasGroups, hasIssueAt, issuesAt, visibleFields } from '@/lib/schema';
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
