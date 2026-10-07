'use client';

import { useState } from 'react';
import { Loader2Icon, MailIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_ROLES, type Member, type ProjectRole } from '@achar/types';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@achar/ui';
import { InvitationBadge, RoleBadge } from '@/components/content/badges';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ErrorNote } from '@/components/ui/empty-state';
import { useAction } from '@/hooks/use-resource';
import { formatDate, relativeTime } from '@/lib/format';
import { roleLabel } from '@/lib/roles';

/**
 * One row of a project's roster: who it is, what they may do, and — for an
 * admin — what to do about it.
 *
 * The badge and the select are deliberately both here. The badge is the answer
 * to "who is on this project", which is what a viewer came for; the select is
 * where an admin changes it, and it is absent rather than disabled for anyone
 * else, because a control that only ever fails teaches nobody the rule.
 *
 * A row whose `status` is `INVITED` is not a membership and has nothing to
 * remove — what it needs is sending again — so the two cases draw different
 * actions over the same details.
 */
export function MemberRow({
  projectId,
  projectName,
  member,
  canAdmin,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  member: Member;
  /** The caller is an admin of this project, so this row can be acted on. */
  canAdmin: boolean;
  /** Re-read the roster after a write, so the list and the API agree. */
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const changeRole = useAction((client, role: ProjectRole) =>
    client.updateMemberRole(projectId, member.userId, role),
  );
  // Removing answers with nothing, so it is lifted into a truthy result:
  // `useAction` reports a failure as a `null` return, and a successful removal
  // that returned `undefined` would read as one.
  const removeMember = useAction(async (client) => {
    await client.removeMember(projectId, member.userId);
    return true;
  });
  const resendInvitation = useAction((client) =>
    client.resendInvitation(projectId, member.userId),
  );

  const busy = changeRole.pending || removeMember.pending || resendInvitation.pending;
  const error = changeRole.error ?? removeMember.error ?? resendInvitation.error;

  const invited = member.status === 'INVITED';
  // An invitation is keyed by the invited address until it is accepted, so a row
  // that has no `email` yet is still a row with an address on it.
  const address = member.email || member.invitedEmail || member.userId;
  const label = member.isYou ? 'You' : member.name?.trim() || address;
  const initials = (member.name?.trim() || address).slice(0, 2).toUpperCase();
  // An invitation has no `joinedAt` — it is not a membership yet — and this line
  // is only drawn for a member.
  const since = `joined ${formatDate(member.joinedAt)}`;

  async function setRole(role: ProjectRole) {
    if (role === member.role) return;

    const updated = await changeRole.run(role);
    if (!updated) return;

    toast.success(`${label} is now ${roleLabel(role).toLowerCase()}`);
    onChanged();
  }

  async function remove() {
    const removed = await removeMember.run();
    if (!removed) return;

    setConfirming(false);
    toast.success(invited ? 'Invitation withdrawn' : `${label} removed from ${projectName}`);
    onChanged();
  }

  async function resend() {
    const resent = await resendInvitation.run();
    if (!resent) return;

    toast.success(`Invitation sent again to ${address}`);
    onChanged();
  }

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-semibold uppercase text-muted-foreground">
          {invited ? <MailIcon className="size-4" /> : initials}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{label}</p>
            <RoleBadge role={member.role} />
            {invited && <InvitationBadge status={member.status} />}
          </div>

          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {address}
            {invited
              ? ` · invited ${relativeTime(member.invitedAt)}${
                  // `invitedBy` is whatever the API resolved the inviter to — a
                  // member's id, or the address of somebody who has not joined —
                  // so it is shown as it came rather than dressed up as a name.
                  member.invitedBy ? ` by ${member.invitedBy}` : ''
                }`
              : ` · ${since}`}
          </p>

          {invited && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing is granted until the invitation is accepted, so this row is an offer rather
              than a member of the project.
            </p>
          )}
        </div>

        {canAdmin && (
          <div className="flex shrink-0 items-center gap-1.5">
            <Select
              value={member.role}
              onValueChange={(value) => {
                if (isRole(value)) void setRole(value);
              }}
              disabled={busy}
            >
              <SelectTrigger className="w-32" aria-label={`Role for ${label}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_ROLES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {roleLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {invited && (
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void resend()}>
                {resendInvitation.pending ? (
                  <Loader2Icon className="animate-spin" />
                ) : (
                  <RefreshCwIcon />
                )}
                Send again
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              aria-label={invited ? `Withdraw the invitation to ${address}` : `Remove ${label}`}
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              {removeMember.pending ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <Trash2Icon className="text-destructive" />
              )}
            </Button>
          </div>
        )}
      </div>

      {/* The failure is drawn in the row rather than as a toast: it is about this
          person, and the row is where the control that produced it lives. */}
      {error && <ErrorNote className="mt-2">{error}</ErrorNote>}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={invited ? 'Withdraw this invitation?' : `Remove ${label}?`}
        description={
          invited ? (
            <span className="block">
              {address} will no longer be able to accept the place offered on {projectName}.
              Withdrawing deletes the invitation; inviting them again makes a new one.
            </span>
          ) : (
            <>
              <span className="block">
                {label} loses access to {projectName} and everything in it, immediately. Documents
                they wrote stay where they are.
              </span>
              {member.isYou && (
                <span className="mt-2 block font-medium text-destructive">
                  This is your own row — removing yourself ends your access to this project, and
                  only another admin can give it back.
                </span>
              )}
            </>
          )
        }
        confirmLabel={invited ? 'Withdraw invitation' : 'Remove member'}
        onConfirm={() => void remove()}
        pending={removeMember.pending}
      />
    </div>
  );
}

/** A `Select` answers with a `string`; the three roles are the only ones worth sending. */
function isRole(value: string): value is ProjectRole {
  return (PROJECT_ROLES as readonly string[]).includes(value);
}
