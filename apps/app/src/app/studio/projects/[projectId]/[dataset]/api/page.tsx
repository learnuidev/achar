'use client';

import { use } from 'react';
import { ApiTokensCard } from '@/components/studio/api-tokens-card';
import { WebhooksCard } from '@/components/studio/webhooks-card';
import { useStudio } from '@/components/studio/studio-context';
import { PageHeader, StatBlock } from '@/components/ui/page-header';
import { useTokens, useWebhooks } from '@/hooks/use-tokens';
import { plural, relativeTime } from '@/lib/format';
import { roleLabel } from '@/lib/roles';

/**
 * The two ways a program reaches this project: a token, and a webhook.
 *
 * They are one screen because they are the same conversation from both ends — a
 * token is a machine asking Achar for content, a webhook is Achar telling a
 * machine that the content moved — and because the question that brings somebody
 * here is usually "how does my site get this", which has one answer each way.
 *
 * Both reads are made here and handed to the cards below, so the numbers in the
 * strip and the rows under them are one answer rather than two that can disagree.
 * The strip is honest about the asymmetry in who may look: tokens are an admin's
 * list and webhooks are every member's.
 */
export default function DatasetApiPage({
  params,
}: {
  params: Promise<{ projectId: string; dataset: string }>;
}) {
  const { projectId, dataset } = use(params);
  const { canAdmin, canEdit, project } = useStudio();

  const tokens = useTokens(projectId);
  const webhooks = useWebhooks(projectId);

  const tokenList = tokens.data ?? [];
  const revokedTokens = tokenList.filter((token) => token.revokedAt).length;
  const activeTokens = tokenList.length - revokedTokens;

  const webhookList = webhooks.data ?? [];
  const enabledWebhooks = webhookList.filter((webhook) => webhook.enabled).length;

  const lastDeliveryAt = webhookList.reduce<string | null>((newest, webhook) => {
    const at = webhook.lastDelivery?.at ?? null;
    if (!at) return newest;
    if (!newest) return at;
    return Date.parse(at) > Date.parse(newest) ? at : newest;
  }, null);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={<span className="font-mono">{dataset}</span>}
        title="API"
        description={
          <>
            Two ways for a program to reach this content. A <strong>token</strong> lets a machine read
            this project without a person signing in — a build script, a nightly job, a site that
            queries while it renders. A <strong>webhook</strong> tells a machine when that content
            changed, by POSTing to a URL of yours. Tokens are the project&rsquo;s and are shared by
            every dataset in it; a webhook belongs to one dataset, and the ones below are made on{' '}
            <span className="font-mono">{dataset}</span>.
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          label="Tokens"
          value={canAdmin ? activeTokens : '—'}
          hint={
            canAdmin
              ? revokedTokens > 0
                ? `${plural(revokedTokens, 'token')} revoked`
                : 'none revoked'
              : 'only an admin sees these'
          }
        />
        <StatBlock
          label="Webhooks"
          value={webhookList.length}
          hint={`${enabledWebhooks} in service`}
        />
        <StatBlock label="Last delivery" value={relativeTime(lastDeliveryAt)} hint="the newest attempt" />
        <StatBlock label="Your role" value={roleLabel(project.role)} hint="issuing a token needs an admin" />
      </div>

      <ApiTokensCard tokens={tokens} canAdmin={canAdmin} />

      <WebhooksCard webhooks={webhooks} dataset={dataset} canEdit={canEdit} />
    </div>
  );
}
