'use client';

import { useState } from 'react';
import { CheckIcon, Link2OffIcon, LinkIcon, SearchIcon, UnlinkIcon } from 'lucide-react';
import type { DocumentSummary } from '@achar/types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  cn,
} from '@achar/ui';
import { hasIssueAt } from '@/lib/schema';
import { useDocuments } from '@/hooks/use-documents';
import { EmptyState, ErrorNote } from '@/components/ui/empty-state';
import { iconFor } from '@/lib/icons';
import { FieldShell, type FieldControlProps } from '@/components/editor/field-controls';

/**
 * A reference: one document pointing at another.
 *
 * The picker searches the target types' own lists rather than listing
 * everything, because the answer to "which author" is usually found by typing
 * three letters of a name, and a dataset with four thousand documents has no
 * useful unfiltered list. What it stores is `{ _ref, _type: 'reference' }` and
 * never the target's fields — the meaning is resolved on read, which is what
 * lets the target be renamed without touching every document that mentions it.
 *
 * The target's own `preview.title` is what the picker and the chosen value are
 * labelled with, so a reference reads the way the list it came from reads.
 */
export function ReferenceField({
  field,
  value,
  onChange,
  path,
  readOnly,
  issues,
  projectId,
  dataset,
}: FieldControlProps) {
  const [open, setOpen] = useState(false);
  const targets = field.to ?? [];
  const reference = referenceId(value);

  return (
    <FieldShell field={field} path={path} invalid={hasIssueAt(issues, path)} readOnly={readOnly}>
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2">
          <LinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs">
            {reference || <span className="text-muted-foreground">nothing chosen</span>}
          </span>
        </div>

        <Button type="button" variant="outline" size="sm" disabled={readOnly} onClick={() => setOpen(true)}>
          {reference ? 'Change' : 'Choose'}
        </Button>

        {reference && !readOnly && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
            title="Clear this reference"
          >
            <UnlinkIcon className="size-4" />
          </Button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Points at{' '}
        {targets.length > 0 ? (
          <span className="font-mono">{targets.join(', ')}</span>
        ) : (
          'nothing the schema declares'
        )}
        .
      </p>

      {open && (
        <ReferenceDialog
          projectId={projectId}
          dataset={dataset}
          targets={targets}
          selected={reference}
          onOpenChange={setOpen}
          onSelect={(document) => {
            onChange({ _ref: document._id, _type: 'reference' });
            setOpen(false);
          }}
        />
      )}
    </FieldShell>
  );
}

/** A reference as the id it carries, whether it was stored as an object or a bare id. */
function referenceId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ref = (value as { _ref?: unknown })._ref;
    if (typeof ref === 'string') return ref;
  }
  return '';
}

function ReferenceDialog({
  projectId,
  dataset,
  targets,
  selected,
  onOpenChange,
  onSelect,
}: {
  projectId: string;
  dataset: string;
  targets: string[];
  selected: string;
  onOpenChange: (open: boolean) => void;
  onSelect: (document: DocumentSummary) => void;
}) {
  const [type, setType] = useState(targets[0] ?? '');
  const [term, setTerm] = useState('');

  const documents = useDocuments(projectId, dataset, {
    type,
    search: term.trim() || undefined,
    limit: 20,
    perspective: 'previewDrafts',
  });

  const items = documents.data?.items ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a {(type || 'document').toLowerCase()}</DialogTitle>
          <DialogDescription>
            References are stored as ids, so renaming a document does not break the ones pointing at
            it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search by title"
              className="pl-8"
              autoFocus
            />
          </div>

          {targets.length > 1 && (
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="w-40" aria-label="Target type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targets.map((target) => (
                  <SelectItem key={target} value={target}>
                    {target}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="max-h-80 min-h-40 overflow-y-auto">
          {documents.error && <ErrorNote>{documents.error}</ErrorNote>}

          {documents.loading && !documents.data ? (
            <div className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Link2OffIcon className="size-5" />}
              title={term ? 'Nothing matches that' : `No ${type} documents yet`}
              description={
                term
                  ? 'Search reads the preview title the schema declares for the target type.'
                  : 'A reference needs something to point at. Write one first, then come back.'
              }
            />
          ) : (
            <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
              {items.map((document) => {
                const Icon = iconFor(undefined);
                return (
                  <button
                    key={document._id}
                    type="button"
                    onClick={() => onSelect(document)}
                    className={cn(
                      'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                      document._id === selected ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{document.title || document._id}</span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {document._id}
                      </span>
                    </span>
                    {document._id === selected && <CheckIcon className="size-4 shrink-0 text-success" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The types a reference field may point at, for a caller that wants to say so. */
export function referenceTargets(field: { to?: string[] }): string[] {
  return field.to ?? [];
}
