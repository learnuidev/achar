'use client';

import { useState } from 'react';
import { Loader2Icon, UserPlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import { PROJECT_ROLES, type ProjectRole } from '@achar/types';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
} from '@achar/ui';
import { useAction } from '@/hooks/use-resource';
import { roleDescription, roleLabel } from '@/lib/roles';

/**
 * The same loose check the API makes, so an obvious typo fails without a round
 * trip. Whether an account exists at that address is the sign-up's answer, not
 * this form's.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/**
 * Offering somebody a place on a project, by address rather than by account.
 *
 * The person does not have to exist yet: the invitation names an address, the
 * pool may never have heard of it, and whoever can sign in as that address
 * claims the offer. That is why the role is asked for here as well as shown in
 * the roster — it is the whole of what is being offered, and it means nothing
 * until the invitation is accepted.
 */
export function InviteMemberDialog({
  projectId,
  projectName,
  trigger,
  onInvited,
}: {
  projectId: string;
  projectName: string;
  trigger?: React.ReactNode;
  /** Re-read the roster, so the outstanding invitation appears where it belongs. */
  onInvited?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ProjectRole>('EDITOR');

  const invite = useAction((client, input: { email: string; role: ProjectRole }) =>
    client.inviteMember(projectId, input),
  );

  const address = email.trim();
  const malformed = address.length > 0 && !EMAIL_PATTERN.test(address);
  const canSubmit = EMAIL_PATTERN.test(address) && !invite.pending;

  function reset() {
    setEmail('');
    setRole('EDITOR');
    invite.reset();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    const member = await invite.run({ email: address, role });
    // A failure keeps the dialog open, with the address still in the field: the
    // API's own sentence is drawn below the form, where the correction is.
    if (!member) return;

    toast.success(`Invitation sent to ${member.invitedEmail ?? member.email ?? address}`, {
      description: `${roleLabel(member.role)} — nothing is granted until it is accepted.`,
    });
    setOpen(false);
    reset();
    onInvited?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <UserPlusIcon />
            Invite
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite somebody to {projectName}</DialogTitle>
          <DialogDescription>
            They do not need an account yet. The invitation waits for whoever signs in as this
            address, and grants nothing until they accept it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="teammate@example.com"
              autoComplete="off"
              autoFocus
            />
            {malformed && (
              <p className="text-xs text-destructive">
                That does not look like an email address.
              </p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium leading-none">Role</legend>
            <div className="grid gap-2">
              {PROJECT_ROLES.map((option) => {
                const selected = role === option;
                return (
                  <label
                    key={option}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors',
                      selected ? 'border-ring bg-muted' : 'border-border hover:bg-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="member-role"
                      value={option}
                      checked={selected}
                      onChange={() => setRole(option)}
                      className="mt-0.5 size-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{roleLabel(option)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {roleDescription(option)}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {invite.error && <p className="text-sm text-destructive">{invite.error}</p>}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {invite.pending ? <Loader2Icon className="animate-spin" /> : <UserPlusIcon />}
              Send invitation
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
