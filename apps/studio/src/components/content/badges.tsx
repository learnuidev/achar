import { Badge, cn } from '@achar/ui';
import type { DatasetVisibility, MemberStatus, ProjectRole, WebhookEvent } from '@achar/types';
import { roleLabel } from '@/lib/roles';

/**
 * The small labels the studio is read by.
 *
 * They are one file because they are one vocabulary: "who may do what", "is
 * this live", "has it been changed since it was". A studio that worded any of
 * those two different ways on two screens would be a studio where the reader
 * has to check which screen they are on before believing a badge.
 */

const TONES = {
  neutral: 'border-border bg-muted text-muted-foreground',
  accent: 'border-transparent bg-accent text-accent-foreground',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/40 bg-warning/15 text-warning',
  danger: 'border-destructive/40 bg-destructive/10 text-destructive',
  info: 'border-info/30 bg-info/10 text-info',
  run: 'border-run/30 bg-run/10 text-run',
} as const;

export type Tone = keyof typeof TONES;

export function ToneBadge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(TONES[tone], 'font-normal', className)}>
      {children}
    </Badge>
  );
}

export function RoleBadge({ role, className }: { role: ProjectRole; className?: string }) {
  const tone: Tone = role === 'ADMIN' ? 'accent' : role === 'EDITOR' ? 'info' : 'neutral';
  return (
    <ToneBadge tone={tone} className={className}>
      {roleLabel(role)}
    </ToneBadge>
  );
}

export function InvitationBadge({ status }: { status: MemberStatus }) {
  return status === 'INVITED' ? (
    <ToneBadge tone="warning">Invited</ToneBadge>
  ) : (
    <ToneBadge tone="success">Active</ToneBadge>
  );
}

export function VisibilityBadge({ visibility }: { visibility: DatasetVisibility }) {
  return visibility === 'PUBLIC' ? (
    <ToneBadge tone="info">Public</ToneBadge>
  ) : (
    <ToneBadge tone="neutral">Private</ToneBadge>
  );
}

export function TypeBadge({ name, title }: { name: string; title?: string }) {
  return (
    <ToneBadge tone="neutral" className="font-mono">
      {title ?? name}
    </ToneBadge>
  );
}

/**
 * Where a document is in the draft/publish pair.
 *
 * Four states, and the difference between them is the product: a document that
 * has never been published is not the same as one whose draft has moved on
 * since it was, and an editor deciding whether to press Publish needs to know
 * which of the two they are looking at.
 */
export function PublishStateBadge({
  hasDraft,
  published,
  className,
}: {
  hasDraft: boolean;
  published: boolean;
  className?: string;
}) {
  if (hasDraft && published) {
    return (
      <ToneBadge tone="warning" className={className}>
        Edited
      </ToneBadge>
    );
  }
  if (hasDraft) {
    return (
      <ToneBadge tone="neutral" className={className}>
        Draft
      </ToneBadge>
    );
  }
  if (published) {
    return (
      <ToneBadge tone="success" className={className}>
        Published
      </ToneBadge>
    );
  }
  return (
    <ToneBadge tone="neutral" className={className}>
      New
    </ToneBadge>
  );
}

const EVENT_TONES: Record<WebhookEvent, Tone> = {
  create: 'info',
  update: 'accent',
  delete: 'danger',
  publish: 'success',
};

export function EventBadge({ event }: { event: WebhookEvent }) {
  return <ToneBadge tone={EVENT_TONES[event]}>{event}</ToneBadge>;
}
