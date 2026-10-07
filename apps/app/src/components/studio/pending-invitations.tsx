'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckIcon, Loader2Icon, MailIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Invitation } from '@achar/types';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@achar/ui';
import { RoleBadge } from '@/components/studio/badges';
import { useAcharClient } from '@/components/studio/client-provider';
import { formatDate } from '@/lib/format';
import { routes } from '@/lib/routes';

/**
 * Offers addressed to you, and the one button that takes them.
 *
 * An invitation is not a membership — until it is accepted it grants nothing,
 * which is why it is drawn above the projects rather than inside them: this is
 * the only screen where somebody who belongs nowhere yet can do something about
 * it. Accepting is a single request, because being signed in as the invited
 * address *is* the proof the API asks for; there is no token to paste.
 */
export function PendingInvitations({
  invitations,
  onAccepted,
}: {
  invitations: Invitation[];
  onAccepted: () => void;
}) {
  const client = useAcharClient();
  const router = useRouter();
  const [accepting, setAccepting] = useState<string | null>(null);

  if (invitations.length === 0) return null;

  async function accept(invitation: Invitation) {
    setAccepting(invitation.projectId);
    try {
      await client.acceptInvitation(invitation.projectId);
      toast.success(`You have joined ${invitation.projectName}`);
      onAccepted();
      router.push(routes.project(invitation.projectId));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not accept the invitation');
    } finally {
      setAccepting(null);
    }
  }

  return (
    <Card className="border-warning/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MailIcon className="size-4 text-warning" />
          {invitations.length === 1
            ? 'You have an invitation'
            : `You have ${invitations.length} invitations`}
        </CardTitle>
        <CardDescription>
          Somebody has offered you a place on a project. Nothing is granted until you accept — an
          unaccepted invitation is an offer, not a membership.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {invitations.map((invitation) => (
          <div
            key={invitation.projectId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-3 py-2.5"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{invitation.projectName}</p>
                <RoleBadge role={invitation.role} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sent to {invitation.email} · {formatDate(invitation.invitedAt)}
              </p>
            </div>

            <Button
              size="sm"
              disabled={accepting === invitation.projectId}
              onClick={() => void accept(invitation)}
            >
              {accepting === invitation.projectId ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <CheckIcon />
              )}
              Accept
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
