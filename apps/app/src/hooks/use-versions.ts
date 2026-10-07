'use client';

import type { DocumentVersionSummary } from '@achar/types';
import { useResource, type Resource } from '@/hooks/use-resource';

/**
 * What a document has said, every time it was published.
 *
 * Read when the history is opened rather than when the editor loads: most visits
 * to a document are to write it, and a list nobody asked for is a request every
 * keystroke-adjacent screen pays for. See `document-history-dialog.tsx`, which
 * mounts this inside the dialog body so that closing the dialog is what stops the
 * reading.
 */
export function useDocumentVersions(
  projectId: string,
  dataset: string,
  documentId: string,
): Resource<DocumentVersionSummary[]> {
  return useResource(`versions:${projectId}/${dataset}/${documentId}`, (client) =>
    client.listDocumentVersions(projectId, dataset, documentId),
  );
}
