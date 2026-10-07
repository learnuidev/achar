'use client';

import { useState } from 'react';
import {
  ArrowLeftIcon,
  CheckIcon,
  HistoryIcon,
  Loader2Icon,
  RotateCcwIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { DocumentVersion, DocumentVersionSummary, SchemaType } from '@achar/types';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Separator,
  Skeleton,
} from '@achar/ui';
import { DocumentPreview } from '@/components/editor/document-preview';
import { useStudio } from '@/components/studio/studio-context';
import { ErrorNote } from '@/components/ui/empty-state';
import { useAction } from '@/hooks/use-resource';
import { useMembers } from '@/hooks/use-members';
import { useDocumentVersions } from '@/hooks/use-versions';
import { formatDateTime, relativeTime } from '@/lib/format';

/**
 * Every time this document was published, and the way back to one of them.
 *
 * A version is written on publish and never changes, so this reads as a list of
 * decisions: `v3` is what the third publish put in front of readers, whether or
 * not anybody has edited since. The drafts in between are deliberately absent —
 * a draft is not a version, it is work, and a history that listed every keystroke
 * a document ever held would be a history nobody could find a decision in.
 *
 * **Restoring writes the draft**, and the dialog says so where it matters: what
 * readers see does not change until somebody publishes. That is the whole reason
 * restore is not a one-click rollback — a version is content somebody reviewed at
 * the time, and putting it back in front of readers is a decision that deserves
 * the same review.
 *
 * Reading a version draws it with the *current* schema, which is a real caveat and
 * not a bug: a field the type has since dropped is not drawn, and a field it has
 * since gained shows as empty. The document itself is exactly as it was stored.
 */
export function DocumentHistoryDialog({
  projectId,
  dataset,
  documentId,
  type,
  canEdit,
  onRestored,
  trigger,
}: {
  projectId: string;
  dataset: string;
  documentId: string;
  type: SchemaType;
  canEdit: boolean;
  onRestored: () => void;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Which language a version's preview is drawn in: the dataset's default, because
  // that is the language the version route answers in when nobody asks for one.
  const { datasetInfo } = useStudio();
  const defaultLanguage = datasetInfo?.defaultLanguage ?? 'en';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button" variant="ghost" size="sm" title="What this document has said">
            <HistoryIcon />
            History
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-3xl">
        {/* Mounted by the dialog, so the list is read when somebody asks for it and
            not on every visit to the editor. */}
        {open && (
          <HistoryBody
            projectId={projectId}
            dataset={dataset}
            documentId={documentId}
            type={type}
            canEdit={canEdit}
            defaultLanguage={defaultLanguage}
            onRestored={() => {
              setOpen(false);
              onRestored();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({
  projectId,
  dataset,
  documentId,
  type,
  canEdit,
  defaultLanguage,
  onRestored,
}: {
  projectId: string;
  dataset: string;
  documentId: string;
  type: SchemaType;
  canEdit: boolean;
  /** The language a version is drawn in — the dataset's, which is what it is read in. */
  defaultLanguage: string;
  onRestored: () => void;
}) {
  const versions = useDocumentVersions(projectId, dataset, documentId);
  const members = useMembers(projectId);

  const [viewing, setViewing] = useState<DocumentVersion | null>(null);
  const [confirming, setConfirming] = useState<DocumentVersionSummary | null>(null);

  const view = useAction(
    async (client, version: number) =>
      client.getDocumentVersion(projectId, dataset, documentId, version),
  );

  const restore = useAction(async (client, version: number) => {
    await client.restoreDocumentVersion(projectId, dataset, documentId, version);
    return true;
  });

  /** Who published a version, in the words of somebody who has to place them. */
  function publisherOf(userId: string | null | undefined): string {
    if (!userId) return 'somebody';
    const member = members.data?.find((candidate) => candidate.userId === userId);
    if (member) return member.name?.trim() || member.email;
    return userId.startsWith('token_') ? 'an API token' : 'somebody no longer on this project';
  }

  async function restoreVersion(entry: DocumentVersionSummary) {
    const done = await restore.run(entry.version);
    if (!done) {
      toast.error(restore.error ?? 'Could not restore that version');
      return;
    }

    toast.success(`v${entry.version} is in the draft`, {
      description: 'Publish when you are ready — what readers see has not changed yet.',
    });
    setConfirming(null);
    onRestored();
  }

  async function openVersion(entry: DocumentVersionSummary) {
    const full = await view.run(entry.version);
    if (full) setViewing(full);
  }

  if (viewing) {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setViewing(null)}>
              <ArrowLeftIcon />
              History
            </Button>
            <span>v{viewing.version}</span>
          </DialogTitle>
          <DialogDescription>
            As it was published {formatDateTime(viewing.publishedAt)} by{' '}
            {publisherOf(viewing.publishedBy)}. Exactly as it was stored — drawn, though, with
            today&rsquo;s schema.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-lg border border-border p-4">
          {/* The version route answers in the dataset's default language unless it is
              asked for another, so the preview is told that rather than the editor's
              language: this screen is about *when*, and following the language on
              screen would be a read per switch for a question nobody asks here. */}
          <DocumentPreview
            type={type}
            value={viewing.document}
            language={viewing.document._language ?? defaultLanguage}
            defaultLanguage={defaultLanguage}
          />
        </div>

        {canEdit && (
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => setConfirming(viewing)}>
              <RotateCcwIcon />
              Restore v{viewing.version}
            </Button>
          </div>
        )}

        <RestoreConfirm
          entry={confirming}
          pending={restore.pending}
          onCancel={() => setConfirming(null)}
          onConfirm={() => confirming && void restoreVersion(confirming)}
        />
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>History</DialogTitle>
        <DialogDescription>
          Every time this document was published. A version never changes, and restoring one puts it
          back in the draft — readers keep seeing what is published until you publish it again.
        </DialogDescription>
      </DialogHeader>

      {versions.error && <ErrorNote>{versions.error}</ErrorNote>}

      {versions.loading && !versions.data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : (versions.data?.length ?? 0) === 0 ? (
        <p className="text-sm text-muted-foreground">
          This document has never been published, so there is nothing here yet. The first publish is
          what becomes v1.
        </p>
      ) : (
        <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
          {(versions.data ?? []).map((entry) => (
            <li
              key={entry.version}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2"
            >
              <Badge variant="outline" className="font-mono">
                v{entry.version}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{formatDateTime(entry.publishedAt)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {relativeTime(entry.publishedAt)} · by {publisherOf(entry.publishedBy)} ·{' '}
                  <span className="font-mono">{entry.rev.slice(0, 7)}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openVersion(entry)}
                  disabled={view.pending}
                >
                  {view.pending && <Loader2Icon className="animate-spin" />}
                  Look
                </Button>
                {canEdit && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(entry)}>
                    <RotateCcwIcon />
                    Restore
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Separator />

      <p className="text-xs text-muted-foreground">
        Deleting a document takes its history with it: a version of something that no longer exists
        is a snapshot nothing can be restored into.
      </p>

      <RestoreConfirm
        entry={confirming}
        pending={restore.pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void restoreVersion(confirming)}
      />
    </>
  );
}

/**
 * The one confirmation, said the same way from both places it can be asked from.
 *
 * It names what is lost as well as what is gained: restoring replaces whatever is
 * in the draft, including edits that were never published — and those are the only
 * copy of that work.
 */
function RestoreConfirm({
  entry,
  pending,
  onCancel,
  onConfirm,
}: {
  entry: DocumentVersionSummary | null;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {entry ? `Restore v${entry.version}?` : 'Restore?'}
          </DialogTitle>
          <DialogDescription>
            {entry ? (
              <>
                The draft becomes what was published {formatDateTime(entry.publishedAt)}. Anything in
                the draft now — including edits that were never published — is replaced, and readers
                keep seeing the current published version until you publish this.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
            Restore
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
