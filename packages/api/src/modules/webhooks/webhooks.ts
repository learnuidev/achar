import type { ListResponse, Webhook, WebhookDelivery, WebhookEvent } from '@achar/types';

import { queryString, segment, type ApiContext } from '../../lib/context';

/**
 * A new webhook.
 *
 * `filter` and `projection` are GROQ, and both default to nothing — which means
 * every write of every type, with the whole document attached. Fine for a
 * listener that wants to know everything; expensive for the one that rebuilds a
 * site, which is why the studio asks for a filter before it lets one be saved.
 */
export interface CreateWebhookBody {
  dataset: string;
  name: string;
  url: string;
  on: WebhookEvent[];
  filter?: string;
  projection?: string;
  /** Written, never read back — the response reports `hasSecret` instead. */
  secret?: string;
  enabled?: boolean;
}

export interface UpdateWebhookBody {
  name?: string;
  url?: string;
  on?: WebhookEvent[];
  filter?: string | null;
  projection?: string | null;
  secret?: string;
  enabled?: boolean;
}

export interface ListDeliveriesOptions {
  limit?: number;
  nextToken?: string;
}

export function listWebhooks(api: ApiContext, projectId: string): Promise<Webhook[]> {
  return api.get<Webhook[]>(`/v1/projects/${projectId}/webhooks`);
}

export function createWebhook(
  api: ApiContext,
  projectId: string,
  body: CreateWebhookBody,
): Promise<Webhook> {
  return api.post<Webhook>(`/v1/projects/${projectId}/webhooks`, body);
}

/** Changes one, or takes it out of service with `enabled: false`. */
export function updateWebhook(
  api: ApiContext,
  projectId: string,
  webhookId: string,
  body: UpdateWebhookBody,
): Promise<Webhook> {
  return api.patch<Webhook>(`/v1/projects/${projectId}/webhooks/${segment(webhookId)}`, body);
}

export function deleteWebhook(
  api: ApiContext,
  projectId: string,
  webhookId: string,
): Promise<void> {
  return api.del<void>(`/v1/projects/${projectId}/webhooks/${segment(webhookId)}`);
}

/** What it has been told, and what happened — the history a webhook is judged by. */
export function listDeliveries(
  api: ApiContext,
  projectId: string,
  webhookId: string,
  options: ListDeliveriesOptions = {},
): Promise<ListResponse<WebhookDelivery>> {
  const search = queryString({ limit: options.limit, nextToken: options.nextToken });
  return api.get<ListResponse<WebhookDelivery>>(
    `/v1/projects/${projectId}/webhooks/${segment(webhookId)}/deliveries${search}`,
  );
}
