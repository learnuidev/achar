'use client';

import type { ApiToken, Webhook, WebhookDelivery } from '@achar/types';
import { asList } from '@/lib/api-shapes';
import { useResource, type Resource } from '@/hooks/use-resource';

/** The project's API tokens. The secrets are not here — they were shown once, at creation. */
export function useTokens(projectId: string): Resource<ApiToken[]> {
  return useResource(`tokens:${projectId}`, async (client) =>
    asList<ApiToken>(await client.listTokens(projectId)),
  );
}

/** The project's webhooks, each with the last thing it was told. */
export function useWebhooks(projectId: string): Resource<Webhook[]> {
  return useResource(`webhooks:${projectId}`, async (client) =>
    asList<Webhook>(await client.listWebhooks(projectId)),
  );
}

/** What one webhook has been told, and what happened when it was. */
export function useDeliveries(
  projectId: string,
  webhookId: string | null,
): Resource<WebhookDelivery[]> {
  return useResource(`deliveries:${projectId}:${webhookId ?? ''}`, async (client) => {
    if (!webhookId) return [];
    return asList<WebhookDelivery>(await client.listDeliveries(projectId, webhookId));
  });
}
