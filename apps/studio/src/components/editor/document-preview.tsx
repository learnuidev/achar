'use client';

import type { PortableText as PortableTextValue, SchemaFieldType, SchemaType } from '@achar/types';
import { PortableText as PortableTextRenderer } from '@/components/content/portable-text';
import { useAssetLibrary } from '@/components/content/asset-library';
import { formatDate, formatDateTime } from '@/lib/format';
import { previewOf } from '@achar/schema';

/**
 * The document as a reader would see it.
 *
 * Not a second editor and not a browser: it walks the same schema the form does
 * and draws what each field holds, so a person can see the shape of what they
 * are publishing without leaving the studio. Rich text goes through the same
 * renderer `apps/web` uses — the studio keeps its own copy on purpose, so the
 * two surfaces agree on what a document looks like without the studio depending
 * on the site — inside the same `.achar-prose` container.
 *
 * It shows the value the form is holding, not the published one, which is the
 * point: the question it answers is "what would this read like if I published
 * it now".
 */
export function DocumentPreview({
  type,
  value,
}: {
  type: SchemaType;
  value: Record<string, unknown>;
}) {
  const library = useAssetLibrary();
  const preview = previewOf(type, value);
  const fields = type.fields.filter((field) => !field.hidden);

  // The fields whose value is already the preview's own heading or subheading
  // are left out of the body, so the document does not appear to begin twice.
  const previewFields = new Set(
    [type.preview?.title, type.preview?.subtitle, type.preview?.media].filter(
      (name): name is string => typeof name === 'string',
    ),
  );

  const body = fields.filter((field) => !previewFields.has(field.name));

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {type.title || type.name}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          {preview.title || <span className="text-muted-foreground">Untitled</span>}
        </h1>
        {preview.subtitle && <p className="text-sm text-muted-foreground">{preview.subtitle}</p>}
      </header>

      <div className="space-y-4">
        {body.map((field) => (
          <section key={field.name} className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {field.title || field.name}
            </p>
            <FieldValue field={field.type} value={value[field.name]} urlFor={library.urlFor} />
          </section>
        ))}
      </div>
    </div>
  );
}

function FieldValue({
  field,
  value,
  urlFor,
}: {
  field: SchemaFieldType;
  value: unknown;
  urlFor: (reference: string | null | undefined) => string | null;
}) {
  if (field === 'portableText') {
    const blocks = Array.isArray(value) ? value : [];
    if (blocks.length === 0) {
      return <p className="text-sm text-muted-foreground">Empty.</p>;
    }
    return <PortableTextRenderer value={value as PortableTextValue} />;
  }

  if (field === 'image' || field === 'file') {
    const reference = referenceOf(value);
    const url = urlFor(reference);
    if (!url) {
      return <p className="text-sm text-muted-foreground">Nothing chosen.</p>;
    }
    return field === 'image' ? (
      // eslint-disable-next-line @next/next/no-img-element -- the CDN host is not in `remotePatterns`.
      <img src={url} alt="" className="max-h-64 rounded-lg border border-border object-contain" />
    ) : (
      <a href={url} className="text-sm text-primary underline" target="_blank" rel="noreferrer">
        {reference}
      </a>
    );
  }

  if (field === 'reference') {
    const reference = referenceOf(value);
    return (
      <p className="font-mono text-xs text-muted-foreground">
        {reference || 'nothing chosen'}
      </p>
    );
  }

  if (field === 'array') {
    const items = Array.isArray(value) ? value : [];
    if (items.length === 0) return <p className="text-sm text-muted-foreground">Empty.</p>;
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {items.map((item, index) => (
          <li key={index}>{scalar(item)}</li>
        ))}
      </ul>
    );
  }

  if (field === 'object') {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    const entries = Object.entries(record);
    if (entries.length === 0) return <p className="text-sm text-muted-foreground">Empty.</p>;
    return (
      <dl className="grid gap-1 text-sm">
        {entries.map(([key, nested]) => (
          <div key={key} className="flex gap-2">
            <dt className="text-muted-foreground">{key}</dt>
            <dd>{scalar(nested)}</dd>
          </div>
        ))}
      </dl>
    );
  }

  if (field === 'datetime' || field === 'date') {
    if (typeof value !== 'string' || !value) {
      return <p className="text-sm text-muted-foreground">Not set.</p>;
    }
    return (
      <p className="text-sm">
        {field === 'date' ? formatDate(value) : formatDateTime(value)}
        <span className="ml-2 font-mono text-xs text-muted-foreground">{value}</span>
      </p>
    );
  }

  if (field === 'boolean') {
    return <p className="text-sm">{value === true ? 'Yes' : 'No'}</p>;
  }

  if (value === '' || value === null || value === undefined) {
    return <p className="text-sm text-muted-foreground">Not set.</p>;
  }

  return <p className="text-sm break-words">{scalar(value)}</p>;
}

function scalar(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const reference = referenceOf(value);
  if (reference) return reference;
  return JSON.stringify(value);
}

function referenceOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const ref = (value as { _ref?: unknown })._ref;
    if (typeof ref === 'string') return ref;
  }
  return '';
}
