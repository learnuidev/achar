'use client';

import { use } from 'react';
import Link from 'next/link';
import { Button } from '@achar/ui';
import { DocumentEditor } from '@/components/editor/document-editor';
import { useStudio } from '@/components/studio/studio-context';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { routes } from '@/lib/routes';

/**
 * One document, one type, one dataset — the editor's route.
 *
 * The id in the URL is the document's own, never the draft's: the two rows are
 * one document to a person, and a link that carried `drafts.` would break the
 * moment somebody published. `?new=1` says the id was minted by the list a
 * moment ago and nothing exists on the server yet, which is what keeps the
 * editor from reading two rows that are not there.
 *
 * The schema is read from the studio shell rather than fetched here, so that the
 * form, the rail and the list are all drawn from one reading of one schema.
 */
export default function DocumentEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; dataset: string; type: string; documentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId, dataset, type: typeName, documentId } = use(params);
  const search = use(searchParams);
  const { types, canEdit } = useStudio();

  const type = types.find((candidate) => candidate.name === typeName) ?? null;
  const isNew = search.new === '1';

  if (!type) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          eyebrow={<span className="font-mono">{typeName}</span>}
          title="No such type"
          description="The schema this dataset is authored against does not declare a type by this name, so there is no form to draw."
        />
        <EmptyState
          title="That type has gone"
          description="A document whose type the schema no longer declares has nowhere to be edited. The types that do exist are in the rail."
          action={
            <Button asChild variant="secondary">
              <Link href={routes.dataset(projectId, dataset)}>Back to the overview</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <DocumentEditor
      // Remounting on a change of document is deliberate: the form's whole state
      // — its value, its save state, its dialogs — belongs to one document, and
      // carrying any of it across a navigation would be carrying it to the wrong
      // row.
      key={`${type.name}:${documentId}`}
      projectId={projectId}
      dataset={dataset}
      type={type}
      documentId={documentId}
      isNew={isNew}
      canEdit={canEdit}
    />
  );
}
