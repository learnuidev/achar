'use client';

import { CheckIcon, CircleAlertIcon } from 'lucide-react';
import type { AcharDocument } from '@achar/types';
import type { SchemaIssue } from '@achar/schema';
import { Separator, cn } from '@achar/ui';
import { CopyButton } from '@/components/ui/copy-row';
import { formatDateTime, relativeTime } from '@/lib/format';

/**
 * The right-hand panel: what the document is, what is wrong with it, and where
 * it sits in the draft/publish pair.
 *
 * Three things that belong together because they are all answers to "should I
 * publish this": the system fields identify the row and cannot be edited; the
 * validation list is what the API will refuse or accept; and the publish state
 * says what a reader would get if the button were pressed now.
 *
 * The validation list never blocks a save, and the panel says so in as many
 * words. A draft is a place for a half-written document — refusing to save one
 * is refusing the thing drafts are for — so these are warnings beside a form that
 * is still being written, not a gate in front of it.
 */
export function InspectorPanel({
  document,
  issues,
  hasDraft,
  published,
  draftDiffers,
  isNew,
  publishedAt,
  draftAt,
  onFocusIssue,
}: {
  document: AcharDocument | null;
  issues: SchemaIssue[];
  hasDraft: boolean;
  published: boolean;
  draftDiffers: boolean;
  isNew: boolean;
  publishedAt: string | null;
  draftAt: string | null;
  onFocusIssue: (path: string) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Publish state
        </h2>

        <div className="space-y-2 rounded-lg border border-border bg-muted p-3 text-xs">
          <StateRow
            label="Published"
            value={published ? `yes${publishedAt ? ` — ${relativeTime(publishedAt)}` : ''}` : 'no'}
            tone={published ? 'success' : 'muted'}
          />
          <StateRow
            label="Draft"
            value={
              hasDraft
                ? `yes${draftAt ? ` — ${relativeTime(draftAt)}` : ''}`
                : isNew
                  ? 'nothing written yet'
                  : 'no'
            }
            tone={hasDraft ? 'warning' : 'muted'}
          />
          <StateRow
            label="Draft differs"
            value={draftDiffers ? 'yes — not published yet' : 'no'}
            tone={draftDiffers ? 'warning' : 'muted'}
          />
        </div>
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Validation
        </h2>

        {issues.length === 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success">
            <CheckIcon className="mt-0.5 size-3.5 shrink-0" />
            Everything the schema requires is present.
          </p>
        ) : (
          <div className="space-y-1.5">
            <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-muted-foreground">
              <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {issues.length} {issues.length === 1 ? 'issue' : 'issues'}. Drafts save anyway — a
              draft is a place for a half-written document — but publishing this as it stands will
              leave the field empty where a reader expects something.
            </p>

            <ul className="space-y-1">
              {issues.map((issue) => (
                <li key={`${issue.path}:${issue.message}`}>
                  <button
                    type="button"
                    onClick={() => onFocusIssue(issue.path)}
                    className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent"
                  >
                    <span className="font-mono text-muted-foreground">{issue.path || '_'}</span>{' '}
                    <span className="text-foreground">{issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          System fields
        </h2>

        <div className="space-y-2 text-xs">
          <Field label="_id" value={document?._id ?? null} copyable />
          <Field label="_type" value={document?._type ?? null} copyable />
          <Field label="_rev" value={document?._rev ?? null} copyable />
          <Field label="_createdAt" value={document?._createdAt ?? null} format="datetime" />
          <Field label="_updatedAt" value={document?._updatedAt ?? null} format="datetime" />
        </div>

        <p className="text-xs text-muted-foreground">
          These belong to the API: `_rev` is reissued on every write and is compared rather than
          parsed, and `_createdAt` is not the same as a document&rsquo;s own `publishedAt`.
        </p>
      </section>
    </div>
  );
}

function StateRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'success' | 'warning' | 'muted';
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-right',
          tone === 'success' && 'text-success',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  format,
  copyable,
}: {
  label: string;
  value: string | null;
  format?: 'datetime';
  copyable?: boolean;
}) {
  const shown = value === null ? '—' : format === 'datetime' ? formatDateTime(value) : value;

  return (
    <div className="rounded-lg border border-border bg-muted px-2.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-muted-foreground">{label}</span>
        {copyable && value && <CopyButton value={value} label="copy" />}
      </div>
      <p className="mt-0.5 break-all font-mono text-foreground" title={value ?? ''}>
        {shown}
      </p>
    </div>
  );
}
