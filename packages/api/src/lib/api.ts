import type {
  AcharDocument,
  ApiErrorBody,
  ApiInfo,
  ApiToken,
  Asset,
  AssetUploadTicket,
  Dataset,
  DatasetExport,
  DatasetSchema,
  DocumentSummary,
  DocumentVersion,
  DocumentVersionSummary,
  Invitation,
  IssuedApiToken,
  ListResponse,
  Member,
  MutationRequest,
  MutationResponse,
  Perspective,
  Profile,
  Project,
  ProjectRole,
  QueryRequest,
  QueryResult,
  TranslationResult,
  Webhook,
  WebhookDelivery,
} from '@achar/types';

import * as assets from '../modules/assets/assets';
import * as datasets from '../modules/datasets/datasets';
import * as documents from '../modules/documents/documents';
import * as me from '../modules/me/me';
import * as members from '../modules/members/members';
import * as projects from '../modules/projects/projects';
import * as schemaModule from '../modules/schema/schema';
import * as tokens from '../modules/tokens/tokens';
import * as webhooks from '../modules/webhooks/webhooks';
import type { ApiContext } from './context';

/** Where the API is, and who is asking. */
export interface AcharClientOptions {
  apiUrl: string;
  token?: string | null;
}

/**
 * Every failure, as the envelope the API answers with.
 *
 * The message is what a page shows and the status is what a page acts on — an
 * invitation to a project the caller is not yet a member of answers 403, and that
 * is a page state rather than an error. `body` carries the whole envelope, because
 * `error.details` is where the API puts the field name or the revision a form
 * needs to say something useful.
 */
export class AcharApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.error.message);
    this.name = 'AcharApiError';
  }
}

/**
 * The content API, typed.
 *
 * One instance per app is enough and one per request is cheap: the client holds a
 * base URL and a token and nothing else, so a server component can build one per
 * render and let the request scope own its lifetime.
 *
 * The token is settable after construction because it arrives after construction:
 * an app builds its client at module scope, before anybody has signed in, and
 * calls `setToken` when a session appears — which is also what keeps a stale token
 * from outliving a sign-out.
 */
export class AcharClient {
  private readonly apiUrl: string;
  private token: string | null;

  private readonly context: ApiContext = {
    request: (path, init) => this.request(path, init),
    get: (path) => this.request(path),
    post: (path, body) => this.request(path, { method: 'POST', body: encode(body) }),
    patch: (path, body) => this.request(path, { method: 'PATCH', body: encode(body) }),
    put: (path, body) => this.request(path, { method: 'PUT', body: encode(body) }),
    del: (path) => this.request(path, { method: 'DELETE' }),
  };

  constructor({ apiUrl, token = null }: AcharClientOptions) {
    // Trailing slashes would make every path `//v1/...`, which some gateways
    // treat as a different route rather than the same one.
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.token = token;
  }

  /** Replaces the token, or clears it on sign-out. */
  setToken(token: string | null): void {
    this.token = token;
  }

  // ── The service itself ─────────────────────────────────────────────────────

  info(): Promise<ApiInfo> {
    return me.info(this.context);
  }

  me(): Promise<Profile> {
    return me.me(this.context);
  }

  myInvitations(): Promise<Invitation[]> {
    return me.myInvitations(this.context);
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  listProjects(): Promise<ListResponse<Project>> {
    return projects.listProjects(this.context);
  }

  createProject(body: projects.CreateProjectBody): Promise<Project> {
    return projects.createProject(this.context, body);
  }

  getProject(projectId: string): Promise<Project> {
    return projects.getProject(this.context, projectId);
  }

  updateProject(projectId: string, body: projects.UpdateProjectBody): Promise<Project> {
    return projects.updateProject(this.context, projectId, body);
  }

  deleteProject(projectId: string): Promise<void> {
    return projects.deleteProject(this.context, projectId);
  }

  // ── Members ────────────────────────────────────────────────────────────────

  listMembers(projectId: string): Promise<Member[]> {
    return members.listMembers(this.context, projectId);
  }

  inviteMember(projectId: string, body: members.InviteMemberBody): Promise<Member> {
    return members.inviteMember(this.context, projectId, body);
  }

  updateMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<Member> {
    return members.updateMemberRole(this.context, projectId, userId, role);
  }

  removeMember(projectId: string, userId: string): Promise<void> {
    return members.removeMember(this.context, projectId, userId);
  }

  resendInvitation(projectId: string, userId: string, role?: ProjectRole): Promise<Member> {
    return members.resendInvitation(this.context, projectId, userId, role);
  }

  acceptInvitation(projectId: string): Promise<Member> {
    return members.acceptInvitation(this.context, projectId);
  }

  // ── Datasets ───────────────────────────────────────────────────────────────

  listDatasets(projectId: string): Promise<Dataset[]> {
    return datasets.listDatasets(this.context, projectId);
  }

  createDataset(projectId: string, body: datasets.CreateDatasetBody): Promise<Dataset> {
    return datasets.createDataset(this.context, projectId, body);
  }

  getDataset(projectId: string, dataset: string): Promise<Dataset> {
    return datasets.getDataset(this.context, projectId, dataset);
  }

  /**
   * What a dataset *is* rather than what is in it: its visibility, and the languages
   * its content may be authored in — the list is written whole, so adding French
   * means sending the list you have plus it. See `UpdateDatasetBody`.
   */
  updateDataset(
    projectId: string,
    dataset: string,
    body: datasets.UpdateDatasetBody,
  ): Promise<Dataset> {
    return datasets.updateDataset(this.context, projectId, dataset, body);
  }

  deleteDataset(projectId: string, dataset: string): Promise<void> {
    return datasets.deleteDataset(this.context, projectId, dataset);
  }

  exportDataset(projectId: string, dataset: string): Promise<DatasetExport> {
    return datasets.exportDataset(this.context, projectId, dataset);
  }

  // ── Schema ─────────────────────────────────────────────────────────────────

  getSchema(projectId: string, dataset: string): Promise<DatasetSchema> {
    return schemaModule.getSchema(this.context, projectId, dataset);
  }

  putSchema(
    projectId: string,
    dataset: string,
    body: schemaModule.PutSchemaBody,
  ): Promise<DatasetSchema> {
    return schemaModule.putSchema(this.context, projectId, dataset, body);
  }

  createType(
    projectId: string,
    dataset: string,
    body: schemaModule.CreateTypeBody,
  ): Promise<DatasetSchema> {
    return schemaModule.createType(this.context, projectId, dataset, body);
  }

  // ── Documents ──────────────────────────────────────────────────────────────

  query<T>(projectId: string, dataset: string, req: QueryRequest): Promise<QueryResult<T>> {
    return documents.query<T>(this.context, projectId, dataset, req);
  }

  listDocuments(
    projectId: string,
    dataset: string,
    options: documents.ListDocumentsOptions,
  ): Promise<ListResponse<DocumentSummary>> {
    return documents.listDocuments(this.context, projectId, dataset, options);
  }

  getDocument(
    projectId: string,
    dataset: string,
    documentId: string,
    perspective?: Perspective | documents.GetDocumentOptions,
  ): Promise<AcharDocument> {
    return documents.getDocument(this.context, projectId, dataset, documentId, perspective);
  }

  mutate(
    projectId: string,
    dataset: string,
    req: MutationRequest,
  ): Promise<MutationResponse> {
    return documents.mutate(this.context, projectId, dataset, req);
  }

  publishDocument(
    projectId: string,
    dataset: string,
    documentId: string,
  ): Promise<MutationResponse> {
    return documents.publishDocument(this.context, projectId, dataset, documentId);
  }

  unpublishDocument(
    projectId: string,
    dataset: string,
    documentId: string,
  ): Promise<MutationResponse> {
    return documents.unpublishDocument(this.context, projectId, dataset, documentId);
  }

  discardDraft(
    projectId: string,
    dataset: string,
    documentId: string,
  ): Promise<MutationResponse> {
    return documents.discardDraft(this.context, projectId, dataset, documentId);
  }

  /**
   * A model translates a document into one of its languages, as the draft.
   *
   * The document comes back marked `ai` and unapproved, and publishing it is refused
   * until `approveTranslations` — which is the point of the call, not a side effect
   * of it. See `TranslateRequest`.
   */
  translateDocument(
    projectId: string,
    dataset: string,
    req: documents.TranslateRequest,
  ): Promise<TranslationResult> {
    return documents.translateDocument(this.context, projectId, dataset, req);
  }

  /**
   * Take responsibility for a language a model translated.
   *
   * A person's act: the API refuses an API token, so a pipeline cannot approve what
   * it generated. The one call that lets a document holding AI translations be
   * published.
   */
  approveTranslations(
    projectId: string,
    dataset: string,
    documentId: string,
    languages: string[],
  ): Promise<MutationResponse> {
    return documents.approveTranslations(this.context, projectId, dataset, documentId, languages);
  }

  /** What a document has said, every time it was published — newest first. */
  listDocumentVersions(
    projectId: string,
    dataset: string,
    documentId: string,
  ): Promise<DocumentVersionSummary[]> {
    return documents.listDocumentVersions(this.context, projectId, dataset, documentId);
  }

  /** One of them, with the document it holds. */
  getDocumentVersion(
    projectId: string,
    dataset: string,
    documentId: string,
    version: number,
  ): Promise<DocumentVersion> {
    return documents.getDocumentVersion(this.context, projectId, dataset, documentId, version);
  }

  /** Puts one back as the draft, where publishing is the next step. */
  restoreDocumentVersion(
    projectId: string,
    dataset: string,
    documentId: string,
    version: number,
  ): Promise<MutationResponse> {
    return documents.restoreDocumentVersion(this.context, projectId, dataset, documentId, version);
  }

  // ── Assets ─────────────────────────────────────────────────────────────────

  listAssets(
    projectId: string,
    dataset: string,
    options?: assets.ListAssetsOptions,
  ): Promise<ListResponse<Asset>> {
    return assets.listAssets(this.context, projectId, dataset, options);
  }

  createUploadTicket(
    projectId: string,
    dataset: string,
    body: assets.CreateUploadTicketBody,
  ): Promise<AssetUploadTicket> {
    return assets.createUploadTicket(this.context, projectId, dataset, body);
  }

  commitAsset(
    projectId: string,
    dataset: string,
    body: assets.CommitAssetBody,
  ): Promise<Asset> {
    return assets.commitAsset(this.context, projectId, dataset, body);
  }

  deleteAsset(projectId: string, dataset: string, assetId: string): Promise<void> {
    return assets.deleteAsset(this.context, projectId, dataset, assetId);
  }

  // ── Tokens ─────────────────────────────────────────────────────────────────

  listTokens(projectId: string): Promise<ApiToken[]> {
    return tokens.listTokens(this.context, projectId);
  }

  createToken(projectId: string, body: tokens.CreateTokenBody): Promise<IssuedApiToken> {
    return tokens.createToken(this.context, projectId, body);
  }

  revokeToken(projectId: string, tokenId: string): Promise<void> {
    return tokens.revokeToken(this.context, projectId, tokenId);
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  listWebhooks(projectId: string): Promise<Webhook[]> {
    return webhooks.listWebhooks(this.context, projectId);
  }

  createWebhook(projectId: string, body: webhooks.CreateWebhookBody): Promise<Webhook> {
    return webhooks.createWebhook(this.context, projectId, body);
  }

  updateWebhook(
    projectId: string,
    webhookId: string,
    body: webhooks.UpdateWebhookBody,
  ): Promise<Webhook> {
    return webhooks.updateWebhook(this.context, projectId, webhookId, body);
  }

  deleteWebhook(projectId: string, webhookId: string): Promise<void> {
    return webhooks.deleteWebhook(this.context, projectId, webhookId);
  }

  listDeliveries(
    projectId: string,
    webhookId: string,
    options?: webhooks.ListDeliveriesOptions,
  ): Promise<ListResponse<WebhookDelivery>> {
    return webhooks.listDeliveries(this.context, projectId, webhookId, options);
  }

  // ── The one request everything above goes through ──────────────────────────

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`);

    const response = await fetch(`${this.apiUrl}${path}`, { ...init, headers });

    if (!response.ok) {
      throw new AcharApiError(response.status, await errorBody(response));
    }

    // A `204`, or a `200` with nothing in it: both mean the write worked and
    // there is nothing to hand back. Reading `.json()` on either throws.
    if (response.status === 204) return undefined as T;
    const text = await response.text();
    return (text === '' ? undefined : JSON.parse(text)) as T;
  }
}

function encode(body: unknown): string | undefined {
  return body === undefined ? undefined : JSON.stringify(body);
}

/**
 * The envelope, from a response that may not be one.
 *
 * A gateway that rejects a request before the Lambda sees it answers with HTML,
 * and a 502 nobody can read is worse than a 502 with a code — so anything
 * unparseable becomes an `ApiErrorBody` of its own rather than a JSON parse error
 * thrown from the one place that was supposed to explain the failure.
 */
async function errorBody(response: Response): Promise<ApiErrorBody> {
  try {
    const parsed: unknown = await response.json();
    if (isApiErrorBody(parsed)) return parsed;
  } catch {
    // Not JSON. The status is all this response has to say.
  }
  return {
    error: {
      code: `HTTP_${response.status}`,
      message: `Request failed (${response.status})`,
    },
  };
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === 'string' && typeof message === 'string';
}
