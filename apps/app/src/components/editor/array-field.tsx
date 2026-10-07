'use client';

import { ArrowDownIcon, ArrowUpIcon, ListIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { SchemaField } from '@achar/types';
import { Button, cn } from '@achar/ui';
import { hasIssueAt, initialForField } from '@/lib/schema';
import { FieldControl, type FieldControlProps } from '@/components/editor/field-controls';

/**
 * A repeatable list of one field.
 *
 * An array is the schema's answer to "how many of these" — a post's categories, an
 * author's links, a plan's feature bullets — so the control is a row per item with
 * the item's own field drawn inside it, recursing through the same dispatch as
 * everything else. A row is an ordinary control rather than a summary line,
 * because the alternative is a form where a nested field can be edited but not
 * seen.
 *
 * Items are addressed by their index — `links[0].href` — which is the path the
 * validator reports issues at, so a mark on a row comes from the same walk that
 * produced the message in the panel beside it.
 */
export function ArrayField({
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
  const items = Array.isArray(value) ? value : [];
  const itemField: SchemaField | undefined = field.of?.[0];

  function replace(index: number, next: unknown) {
    const copy = [...items];
    copy[index] = next;
    onChange(copy);
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    const [moving] = copy.splice(index, 1);
    copy.splice(target, 0, moving);
    onChange(copy);
  }

  if (!itemField) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        The schema declares <span className="font-mono">{field.name}</span> as an array without
        saying what an item is, so there is no control to draw. Add an <span className="font-mono">of</span>{' '}
        to the field.
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid gap-2 rounded-xl border border-border p-3',
        hasIssueAt(issues, path) && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {field.title || field.name}
          <span className="ml-2 font-normal normal-case text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
        </p>

        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange([...items, initialForField(itemField, defaultLanguage)])}
          >
            <PlusIcon />
            Add
          </Button>
        )}
      </div>

      {field.description && <p className="text-xs text-muted-foreground">{field.description}</p>}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          Empty. {readOnly ? 'Nothing was added here.' : 'Add one to start.'}
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map((item, index) => (
            <div
              key={`${path}[${index}]`}
              className="grid gap-2 rounded-lg border border-border bg-card p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ListIcon className="size-3.5" />
                  {(field.title || field.name).replace(/s$/, '')} {index + 1}
                </span>

                {!readOnly && (
                  <div className="flex items-center gap-1">
                    <IconAction
                      label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      icon={<ArrowUpIcon className="size-3.5" />}
                    />
                    <IconAction
                      label="Move down"
                      disabled={index === items.length - 1}
                      onClick={() => move(index, 1)}
                      icon={<ArrowDownIcon className="size-3.5" />}
                    />
                    <IconAction
                      label="Remove"
                      destructive
                      onClick={() => onChange(items.filter((_, i) => i !== index))}
                      icon={<Trash2Icon className="size-3.5" />}
                    />
                  </div>
                )}
              </div>

              <FieldControl
                field={itemField}
                value={item}
                onChange={(next) => replace(index, next)}
                document={item && typeof item === 'object' ? (item as Record<string, unknown>) : document}
                path={`${path}[${index}]`}
                readOnly={readOnly}
                issues={issues}
                projectId={projectId}
                dataset={dataset}
                language={language}
                defaultLanguage={defaultLanguage}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconAction({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        destructive && 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {icon}
    </button>
  );
}
