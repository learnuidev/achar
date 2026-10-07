'use client';

import { use } from 'react';
import { FileTextIcon, PencilIcon } from 'lucide-react';
import type { SchemaField, SchemaOrdering, SchemaType } from '@achar/types';
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@achar/ui';
import { TypeBadge } from '@/components/studio/badges';
import { ContentTypeDialog } from '@/components/studio/content-type-dialog';
import { useStudio } from '@/components/studio/studio-context';
import { CopyRow } from '@/components/ui/copy-row';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader, StatBlock } from '@/components/ui/page-header';
import { formatDateTime } from '@/lib/format';
import { iconFor } from '@/lib/icons';
import { fieldTitle } from '@/lib/schema';

/**
 * The schema a dataset is authored against: what it holds, and how to change it.
 *
 * This page reads the schema out of the studio shell rather than fetching it: the
 * rail beside it is drawn from the same object, and a second read is a page that
 * can disagree with its own navigation about which types exist.
 *
 * **It is where content types are written**, which is the one thing this page and
 * the rail both depend on and neither can invent: a dataset holds whatever its
 * owner says it holds, and until somebody says, there is nothing to list, no form
 * to draw and no query to run. So the type editor lives here — one dialog per type,
 * opened from the header or from the type itself — and everything else on the page
 * is a reading of what it wrote.
 *
 * The page still reads rather than writes: `PUT …/schema` replaces the whole list
 * of types, so a save is a merge of one type into the stored list, and it is the
 * dialog that does it (`mergeInto`). Nothing here holds a half-edited schema.
 */
export default function DatasetSchemaPage({
  params,
}: {
  params: Promise<{ projectId: string; dataset: string }>;
}) {
  const { projectId, dataset } = use(params);
  const { schema, canEdit, refreshSchema } = useStudio();

  const documents = schema.types.filter((type) => type.kind === 'document');
  const objects = schema.types.filter((type) => type.kind === 'object');
  const fieldCount = schema.types.reduce((sum, type) => sum + countFields(type.fields), 0);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={<span className="font-mono">schema {schema.revision.slice(0, 7)}</span>}
        title={dataset}
        description={
          <>
            Every form in the studio is drawn from this — the rail&rsquo;s list of types, each
            editor&rsquo;s controls, the name a list gives a document and the orderings it offers. A
            type is written as TypeScript, or read out of a sample of your data, and saving one
            writes a whole new revision:{' '}
            <span className="font-mono">
              PUT /v1/projects/{projectId}/datasets/{dataset}/schema
            </span>
            .
          </>
        }
        actions={canEdit ? <ContentTypeDialog schema={schema} onSaved={refreshSchema} /> : undefined}
      />

      <CopyRow
        label="Revision"
        value={schema.revision}
        hint={`Last written ${formatDateTime(schema.updatedAt)}.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatBlock label="Document types" value={documents.length} hint="what a person authors" />
        <StatBlock label="Object types" value={objects.length} hint="only ever fields of one" />
        <StatBlock label="Fields" value={fieldCount} hint="counting every nested one" />
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-muted-foreground">Document types</h2>

        {documents.length === 0 ? (
          <EmptyState
            icon={<FileTextIcon className="size-5" />}
            title="No content types yet"
            description={
              <>
                A dataset holds whatever its owner says it holds, and this one says nothing yet. Define
                a type — a name, an icon and the fields a document of it has — and the studio draws a
                list for it, a form to fill in, and a query to read it back. If you have a document
                already, paste a sample of it and the fields are read from that.
              </>
            }
            action={canEdit ? <ContentTypeDialog schema={schema} onSaved={refreshSchema} /> : undefined}
          />
        ) : (
          documents.map((type) => <TypeCard key={type.name} type={type} />)
        )}
      </section>

      {objects.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">Object types</h2>
          <p className="max-w-2xl text-xs text-muted-foreground">
            An object type is only ever a field of a document, so there is no list of them to fill
            in. A reference to one is a reference to the document that carries it.
          </p>

          {objects.map((type) => (
            <TypeCard key={type.name} type={type} />
          ))}
        </section>
      )}
    </div>
  );
}

/** One type, with everything the schema says about it — and the way to change it. */
function TypeCard({ type }: { type: SchemaType }) {
  const { schema, canEdit, refreshSchema } = useStudio();
  const Icon = iconFor(type.icon);
  const orderings = type.orderings ?? [];
  const groups = type.groups ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{type.title || type.name}</CardTitle>
            <span className="font-mono text-xs text-muted-foreground">{type.name}</span>
            <Badge variant="outline" className="font-normal text-muted-foreground">
              {type.kind}
            </Badge>
          </div>
          {type.description && <CardDescription>{type.description}</CardDescription>}
        </div>

        {canEdit && (
          <ContentTypeDialog
            schema={schema}
            type={type}
            onSaved={refreshSchema}
            trigger={
              <Button variant="outline" size="sm">
                <PencilIcon />
                Edit
              </Button>
            }
          />
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <FieldsTable fields={type.fields} />

        {(type.preview || orderings.length > 0 || groups.length > 0) && (
          <div className="grid gap-4 sm:grid-cols-2">
            {type.preview && <PreviewBlock preview={type.preview} />}
            {orderings.length > 0 && <OrderingsBlock orderings={orderings} />}
            {groups.length > 0 && <GroupsBlock groups={groups} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * A type's fields, one row each.
 *
 * Read-only and hidden are marked rather than filtered out, which is the whole
 * difference between this table and a form: a hidden field is still a field of
 * the document, and somebody reading a schema needs to see that it is there and
 * why nothing on screen ever asks for it.
 */
function FieldsTable({ fields }: { fields: SchemaField[] }) {
  if (fields.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This type declares no fields, so a document of it is only its id and its type.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Required</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {fields.map((field) => {
            const shape = shapeOf(field);
            return (
              <tr key={field.name} className="align-top">
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-foreground">{field.name}</span>
                    <span className="text-xs text-muted-foreground">{fieldTitle(field)}</span>
                    {field.readOnly && (
                      <Badge variant="muted" className="font-normal">
                        Read-only
                      </Badge>
                    )}
                    {field.hidden && (
                      <Badge variant="muted" className="font-normal">
                        Hidden
                      </Badge>
                    )}
                  </div>
                  {field.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{field.description}</p>
                  )}
                </td>

                <td className="px-3 py-2">
                  <TypeBadge name={field.type} />
                  {shape && <p className="mt-1 font-mono text-xs text-muted-foreground">{shape}</p>}
                </td>

                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {field.required ? 'required' : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Which field a list takes a document's name, its second line and its image from. */
function PreviewBlock({ preview }: { preview: NonNullable<SchemaType['preview']> }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</h3>
      <dl className="grid gap-1 text-xs">
        <PreviewLine label="Title" field={preview.title} />
        <PreviewLine label="Subtitle" field={preview.subtitle} />
        <PreviewLine label="Media" field={preview.media} />
      </dl>
    </section>
  );
}

function PreviewLine({ label, field }: { label: string; field?: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-muted-foreground">{label}</dt>
      <dd className={field ? 'font-mono text-foreground' : 'text-muted-foreground'}>
        {field ?? '—'}
      </dd>
    </div>
  );
}

/** The ways a list of these can be ordered, which is what the list's picker offers. */
function OrderingsBlock({ orderings }: { orderings: SchemaOrdering[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Orderings
      </h3>
      <ul className="space-y-1.5">
        {orderings.map((ordering) => (
          <li key={ordering.name} className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs font-medium">{ordering.title}</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {ordering.name} ·{' '}
              {ordering.by.map((rule) => `${rule.field} ${rule.direction}`).join(', ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The tabs the editor splits a document's fields across. */
function GroupsBlock({ groups }: { groups: { name: string; title: string }[] }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Groups</h3>
      <div className="flex flex-wrap gap-1.5">
        {groups.map((group) => (
          <Badge key={group.name} variant="outline" className="font-normal">
            {group.title}
            <span className="font-mono text-muted-foreground">{group.name}</span>
          </Badge>
        ))}
      </div>
    </section>
  );
}

/**
 * The nested shape of a field whose value is not a scalar, on one line.
 *
 * A table inside a table is a form drawn as a form: what a reader wants from
 * `links` is that each item holds a `label` and an `href`, not how those two are
 * arranged on screen. The nesting is drawn in full by the editor, one field at a
 * time, which is where it is worth the room.
 */
function shapeOf(field: SchemaField): string | null {
  if (field.type === 'object') {
    return names(field.fields ?? []);
  }
  if (field.type === 'array') {
    const items = field.of ?? [];
    return items.length > 0 ? items.map(itemShape).join(' | ') : null;
  }
  if (field.type === 'reference') {
    return field.to?.length ? `→ ${field.to.join(' | ')}` : null;
  }
  // A closed set of options is the field's shape as much as its type is: it is
  // what every value of it has to be one of.
  if (field.options?.length) {
    return field.options.map((option) => option.value).join(' | ');
  }
  return null;
}

function itemShape(item: SchemaField): string {
  if (item.type === 'object') {
    return names(item.fields ?? []) || 'object';
  }
  if (item.type === 'reference') {
    return item.to?.length ? `reference → ${item.to.join(' | ')}` : 'reference';
  }
  return item.type;
}

function names(fields: SchemaField[]): string {
  return fields.map((field) => field.name).join(', ');
}

/** Every field a type declares, including the ones nested inside `object` and `array` fields. */
function countFields(fields: SchemaField[]): number {
  return fields.reduce(
    (sum, field) => sum + 1 + countFields([...(field.fields ?? []), ...(field.of ?? [])]),
    0,
  );
}
