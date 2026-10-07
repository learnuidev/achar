'use client';

import { useState } from 'react';
import { KeyRoundIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { ApiToken } from '@achar/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  cn,
} from '@achar/ui';
import { RoleBadge, ToneBadge } from '@/components/content/badges';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState, ErrorNote, ReadOnlyNote } from '@/components/ui/empty-state';
import { CreateTokenDialog } from '@/components/studio/create-token-dialog';
import { useStudio } from '@/components/studio/studio-context';
import { useAction, type Resource } from '@/hooks/use-resource';
import { formatDateTime, relativeTime } from '@/lib/format';

/**
 * The project's tokens: the credentials machines hold, and the one control that
 * matters about them.
 *
 * The read is made by the page and handed in rather than repeated here, so the
 * count in the strip above this card and the rows inside it are one answer
 * instead of two that can disagree. Revoking is the only write, and it is behind
 * a confirmation because it breaks something elsewhere rather than something in
 * front of the person doing it.
 *
 * The API answers `GET /tokens` to admins only, so a viewer's read comes back
 * forbidden: the half is drawn as a note rather than as an error, because "an
 * admin issues your keys" is the sentence that helps and "you are not allowed"
 * is not.
 */
export function ApiTokensCard({
  tokens,
  canAdmin,
}: {
  tokens: Resource<ApiToken[]>;
  canAdmin: boolean;
}) {
  const { projectId } = useStudio();
  const list = tokens.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">API tokens</CardTitle>
          <CardDescription>
            A token lets a machine read this project&rsquo;s content without a person signing in. It
            belongs to the project, so every dataset here shares it.
          </CardDescription>
        </div>
        {canAdmin && <CreateTokenDialog projectId={projectId} onIssued={tokens.refresh} />}
      </CardHeader>

      <CardContent>
        {!canAdmin ? (
          <ReadOnlyNote>
            Only an admin of this project can see its tokens or issue one. Ask an admin for a key,
            and say which dataset and role it is for — a token is narrowed when it is made, not
            afterwards.
          </ReadOnlyNote>
        ) : tokens.error ? (
          <ErrorNote>{tokens.error}</ErrorNote>
        ) : tokens.loading && !tokens.data ? (
          <div className="space-y-2">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon={<KeyRoundIcon className="size-5" />}
            title="No tokens yet"
            description={
              <>
                A token is a credential for a program rather than a person: a build script, a nightly
                job, a site that queries this API while it renders. Issue one and it reaches what its
                role and dataset allow, with no sign-in and nothing else about the project.
              </>
            }
            action={<CreateTokenDialog projectId={projectId} onIssued={tokens.refresh} />}
          />
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {list.map((token) => (
              <TokenRow
                key={token.tokenId}
                projectId={projectId}
                token={token}
                onRevoked={tokens.refresh}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One token: what it is called, what it may do, and what it has been doing.
 *
 * A revoked token stays on the list rather than disappearing, because a row that
 * vanished and a row that was never there read the same to whoever is checking
 * whether the credential they cut off is really cut off.
 */
function TokenRow({
  projectId,
  token,
  onRevoked,
}: {
  projectId: string;
  token: ApiToken;
  onRevoked: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  // The action answers the id it revoked rather than nothing at all: `revokeToken`
  // resolves to `void`, and a successful `void` is indistinguishable from the
  // `null` a failure returns.
  const revoke = useAction(async (client, tokenId: string) => {
    await client.revokeToken(projectId, tokenId);
    return tokenId;
  });

  const revoked = Boolean(token.revokedAt);

  async function confirm() {
    const revokedId = await revoke.run(token.tokenId);
    if (!revokedId) {
      toast.error(revoke.error ?? 'Could not revoke the token');
      return;
    }

    toast.success(`${token.name} revoked`, {
      description: 'Whatever holds it stops working on its next call.',
    });
    setConfirming(false);
    onRevoked();
  }

  return (
    <>
      <div className={cn('flex items-start gap-3 px-4 py-3', revoked && 'opacity-60')}>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{token.name}</p>
            <RoleBadge role={token.role} />
            <ToneBadge tone="neutral" className="font-mono">
              {token.dataset ?? 'every dataset'}
            </ToneBadge>
            {token.revokedAt && (
              <ToneBadge tone="neutral">revoked {relativeTime(token.revokedAt)}</ToneBadge>
            )}
          </div>

          <p
            className="text-xs text-muted-foreground"
            title={`Created ${formatDateTime(token.createdAt)}`}
          >
            created {relativeTime(token.createdAt)} by{' '}
            <span className="font-mono">{token.createdBy}</span>
            {' · '}
            {token.lastUsedAt ? `last used ${relativeTime(token.lastUsedAt)}` : 'never used'}
          </p>
        </div>

        {!revoked && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setConfirming(true)}
            aria-label={`Revoke ${token.name}`}
          >
            <Trash2Icon />
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Revoke ${token.name}?`}
        description={
          <>
            Whatever holds this token keeps working until its next call, and then stops — the API
            keeps a hash of the secret and cannot hand it back. Issue another and put it where the
            old one was.
          </>
        }
        confirmLabel="Revoke token"
        onConfirm={() => void confirm()}
        pending={revoke.pending}
      />
    </>
  );
}
