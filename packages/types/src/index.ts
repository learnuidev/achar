/**
 * Achar — the shapes every surface agrees on.
 *
 * This package is the contract, and it is deliberately the only one every other
 * workspace depends on: the API writes these, the studio and the public site read
 * them, and the console reports on the deployment that serves them. It holds no
 * logic and imports nothing, so it can be read as the answer to "what is a
 * document here" without following anything.
 *
 * The model is the one a structured-content system has, and three splits in it
 * are the whole design:
 *
 * - **A project owns datasets; a dataset owns documents.** A project is the
 *   collaboration and billing boundary, a dataset is a content store inside it
 *   (`production`, `staging`), and nothing is authored outside one.
 * - **A document is a draft or it is published, and the pair is the point.** The
 *   draft is the document whose id begins `drafts.`; the published one is the
 *   document. They are two rows, not one row with a flag, which is what lets a
 *   draft be edited for a week while the site keeps serving what was published.
 * - **Content is an array of objects with a type, not a row with columns.** A
 *   document's fields are whatever its schema says, so `AcharDocument` is open by
 *   construction rather than a fixed shape with a hole punched in it.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Identity
// ─────────────────────────────────────────────────────────────────────────────

/** The person behind a request. Taken from the token, never from a body. */
export interface Viewer {
  userId: string;
  email: string;
  name?: string | null;
}

/** A viewer plus what they have. What `GET /me` answers. */
export interface Profile {
  userId: string;
  email: string;
  name?: string | null;
  createdAt: string;
  /** Projects the caller is an active member of. */
  projectCount: number;
  /** Invitations addressed to the caller's own address and not yet accepted. */
  invitationCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Projects, members, datasets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three roles, and the whole of what differs between members.
 *
 * | Role | Project | Content |
 * | --- | --- | --- |
 * | `ADMIN` | Manages the project and its members | Everything an editor can do |
 * | `EDITOR` | — | Reads and writes documents, assets and the schema |
 * | `VIEWER` | — | Reads them; cannot change anything |
 */
export type ProjectRole = 'ADMIN' | 'EDITOR' | 'VIEWER';

/** The roles, in the order a picker should offer them. */
export const PROJECT_ROLES: readonly ProjectRole[] = ['ADMIN', 'EDITOR', 'VIEWER'];

/** A project is the collaboration boundary: datasets live in one, members belong to one. */
export interface Project {
  projectId: string;
  name: string;
  /** Derived from the name, with a short random suffix — `acme-content-9f2c41`. */
  slug: string;
  organizationName: string;
  ownerId: string;
  memberCount: number;
  datasetCount: number;
  createdAt: string;
  updatedAt: string;
  /**
   * The **caller's** role in this project, resolved by the API on every read.
   *
   * Carried on the project rather than fetched separately because "may I edit
   * this" is a question every screen asks about the thing it is already drawing,
   * and a second request to answer it is a second request that can disagree.
   */
  role: ProjectRole;
}

/** Whether an anonymous reader may query a dataset with a public token. */
export type DatasetVisibility = 'PUBLIC' | 'PRIVATE';

/** A content store inside a project. Documents and assets belong to one. */
export interface Dataset {
  projectId: string;
  /** The name in the URL and in every query — `production`. */
  datasetName: string;
  visibility: DatasetVisibility;
  documentCount: number;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
  /** When a document in it was last written. Absent until something is. */
  lastMutationAt?: string | null;
}

/** An invitation is not a membership — see `Member.status`. */
export type MemberStatus = 'ACTIVE' | 'INVITED';

/**
 * A membership row, or an offer of one.
 *
 * `status: 'INVITED'` is **not** a membership: every authorization check treats it
 * as no membership at all, so an unaccepted offer grants nothing. That is why the
 * row is keyed by the invited *address* until it is accepted — the pool may never
 * have heard of the person — and re-keyed to their id when it is.
 */
export interface Member {
  projectId: string;
  /** The person's id once accepted; the invited address before then. */
  userId: string;
  email: string;
  name?: string | null;
  role: ProjectRole;
  status: MemberStatus;
  /** What the invitation was *for*. Kept separately from `email`, which it becomes. */
  invitedEmail?: string | null;
  invitedBy?: string | null;
  invitedAt: string;
  joinedAt?: string | null;
  /** True when this row is the caller's own. */
  isYou?: boolean;
}

/** An offer addressed to the caller, in a project they do not belong to yet. */
export interface Invitation {
  projectId: string;
  projectName: string;
  role: ProjectRole;
  email: string;
  invitedBy?: string | null;
  invitedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The field types a schema may name.
 *
 * Every one of these is a *form control* as much as a type: the studio draws its
 * editor from this string, so a type with no editor is a type nobody can author.
 */
export type SchemaFieldType =
  | 'string'
  | 'text'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'date'
  | 'slug'
  | 'url'
  | 'email'
  | 'image'
  | 'file'
  | 'reference'
  | 'portableText'
  | 'array'
  | 'object';

/** One field of a document type — what it is called, and what it holds. */
export interface SchemaField {
  name: string;
  title: string;
  type: SchemaFieldType;
  description?: string;
  placeholder?: string;
  /** A document is refused without it. */
  required?: boolean;
  readOnly?: boolean;
  hidden?: boolean;
  initialValue?: unknown;
  /** For a `string`: the closed set of values, which makes it a picker. */
  options?: { title: string; value: string }[];
  /** For an `array`: the field each item is. */
  of?: SchemaField[];
  /** For an `object`: its own fields. */
  fields?: SchemaField[];
  /** For a `reference`: the document types it may point at. */
  to?: string[];
  /** Bounds, for a `number` or a list length. */
  min?: number;
  max?: number;
  /** How tall a `text` or `portableText` editor is drawn. */
  rows?: number;
  /** Which tab of the editor it belongs on. */
  group?: string;
}

/** How a list of documents is ordered when it is browsed. */
export interface SchemaOrdering {
  name: string;
  title: string;
  by: { field: string; direction: 'asc' | 'desc' }[];
}

/**
 * A type a dataset accepts.
 *
 * `kind: 'document'` is something a person authors and a query returns;
 * `kind: 'object'` is only ever a field of one. The distinction is what the
 * studio's sidebar lists: an object type with no documents is not a list nobody
 * has filled in, it is not a list at all.
 */
export interface SchemaType {
  name: string;
  title: string;
  kind: 'document' | 'object';
  description?: string;
  /** A lucide icon name, drawn beside the type in the studio. */
  icon?: string;
  fields: SchemaField[];
  groups?: { name: string; title: string }[];
  /** Which of a document's fields name it in a list, instead of its id. */
  preview?: { title?: string; subtitle?: string; media?: string };
  orderings?: SchemaOrdering[];
}

/** The schema a dataset is authored against, and the revision it is at. */
export interface DatasetSchema {
  projectId: string;
  dataset: string;
  types: SchemaType[];
  /** Changes whenever `types` does — what a client compares to know it is stale. */
  revision: string;
  updatedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────────────────────

/** The fields every document has, whoever wrote it. */
export interface DocumentStub {
  _id: string;
  _type: string;
  /** Opaque and reissued on every write. Compared, never parsed. */
  _rev: string;
  _createdAt: string;
  _updatedAt: string;
}

/**
 * A document as the API returns it.
 *
 * Open by construction: a document's fields are whatever its schema says, so this
 * carries the five system fields and lets everything else through. The system
 * fields all begin `_`, which is the one naming rule content has to respect —
 * and a field named `_anything` is refused at the write rather than stored and
 * shadowed on the way out.
 */
export interface AcharDocument extends DocumentStub {
  /** True when this row is the `drafts.<id>` copy rather than the published one. */
  _draft?: boolean;
  /** Whether a published version of this document exists alongside this row. */
  _published?: boolean;
  /** Whether the caller may change it, resolved on read like `Project.role`. */
  _editable?: boolean;
  [field: string]: unknown;
}

/** What a list shows about a document without reading all of it. */
export interface DocumentSummary {
  _id: string;
  _type: string;
  _rev: string;
  _createdAt: string;
  _updatedAt: string;
  /** A draft exists beside the published row. */
  hasDraft: boolean;
  /** A published row exists at all. */
  published: boolean;
  /** Resolved through the type's schema `preview`. */
  title: string;
  subtitle?: string | null;
  mediaUrl?: string | null;
}

/**
 * Which version of a document a read means.
 *
 * | Perspective | A document that is only a draft |
 * | --- | --- |
 * | `raw` | returned, `_draft: true` |
 * | `previewDrafts` | returned, `_draft: true` |
 * | `published` | omitted |
 *
 * `raw` and `previewDrafts` differ on a document that has **both**: `raw` answers
 * the published row and `previewDrafts` answers the draft, which is the whole
 * difference between what a site serves and what its editor sees.
 */
export type Perspective = 'raw' | 'published' | 'previewDrafts';

/** The perspectives, in the order a picker should offer them. */
export const PERSPECTIVES: readonly Perspective[] = ['raw', 'published', 'previewDrafts'];

// ─────────────────────────────────────────────────────────────────────────────
// Queries and mutations
// ─────────────────────────────────────────────────────────────────────────────

/** A query, and what it is asked against. */
export interface QueryRequest {
  /** GROQ. See `services/api/src/lib/groq` for the grammar that is implemented. */
  query: string;
  /** `$name` values the query refers to. */
  params?: Record<string, unknown>;
  perspective?: Perspective;
  /** How many documents one answer may carry, before the query's own slice. */
  limit?: number;
}

/** An answer, and how long it took — a number worth showing beside a query. */
export interface QueryResult<T = unknown> {
  result: T;
  ms: number;
  perspective: Perspective;
  /** How many documents the query read. What makes a slow query legible. */
  documentsRead: number;
}

/** What a mutation did, so a client can update one document without re-reading. */
export type MutationOperation =
  | 'create'
  | 'replace'
  | 'patch'
  | 'delete'
  | 'publish'
  | 'unpublish';

export interface MutationResult {
  documentId: string;
  operation: MutationOperation;
  /** The revision the write produced, or the one it removed. */
  rev: string;
}

/**
 * One write.
 *
 * Exactly one key is set per element, and that is the shape rather than a
 * convention: a mutation is applied *in order* and each element names one thing
 * done, so an array of them is a script a reader can follow rather than a
 * document-sized guess at what changed.
 *
 * **A mutation never writes the published row directly.** `create`, `replace` and
 * `patch` write the draft; `publish` is what moves a draft onto the published id,
 * and `unpublish` is what takes it back off. That is why publishing is a step
 * somebody takes rather than a side effect of typing.
 */
export interface DocumentMutation {
  create?: { _id?: string; _type: string; [field: string]: unknown };
  createOrReplace?: { _id: string; _type: string; [field: string]: unknown };
  createIfNotExists?: { _id: string; _type: string; [field: string]: unknown };
  patch?: {
    id: string;
    set?: Record<string, unknown>;
    setIfMissing?: Record<string, unknown>;
    unset?: string[];
    inc?: Record<string, number>;
  };
  delete?: { id: string };
  /** Move the draft onto the published id, and clear the draft. */
  publish?: { id: string };
  /** Take the published row away, leaving the draft — the draft is where it goes. */
  unpublish?: { id: string };
}

export interface MutationRequest {
  mutations: DocumentMutation[];
  /** Fail the whole batch rather than applying what can be applied. */
  atomic?: boolean;
}

export interface MutationResponse {
  results: MutationResult[];
  /** What the transaction id was, so a log line and a request can be tied together. */
  transactionId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Portable text
// ─────────────────────────────────────────────────────────────────────────────

/** A run of text with the marks applied to it. */
export interface PortableTextSpan {
  _type: 'span';
  _key: string;
  text: string;
  /** `strong`, `em`, `code`, or the `_key` of a mark definition (a link). */
  marks: string[];
}

/** A mark that needs more than a name — a link needs somewhere to go. */
export interface PortableTextMarkDef {
  _key: string;
  _type: string;
  [field: string]: unknown;
}

/** A block of rich text: a paragraph, a heading, a list item, a quote. */
export interface PortableTextBlock {
  _type: 'block';
  _key: string;
  style: 'normal' | 'h1' | 'h2' | 'h3' | 'h4' | 'blockquote';
  listItem?: 'bullet' | 'number';
  level?: number;
  children: PortableTextSpan[];
  markDefs: PortableTextMarkDef[];
}

/** An image embedded in rich text, which is an object rather than a block. */
export interface PortableTextImage {
  _type: 'image';
  _key: string;
  asset: { _ref: string; _type: 'reference' };
  alt?: string;
  caption?: string;
}

/** Rich text is an array of these, in order. */
export type PortableTextNode = PortableTextBlock | PortableTextImage;

/** What a `portableText` field holds. */
export type PortableText = PortableTextNode[];

// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────

export type AssetKind = 'image' | 'file';

/**
 * An uploaded file.
 *
 * The bytes are not here and never pass through a handler: an upload reserves the
 * row, takes a presigned URL, and PUTs straight to S3. `url` is the CDN address
 * the row resolves to, built on read rather than stored, so a distribution that
 * moves does not orphan every asset a document points at.
 */
export interface Asset {
  assetId: string;
  projectId: string;
  dataset: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
  /** Images only, read at upload time by the studio. */
  width?: number | null;
  height?: number | null;
  /** A CSS placeholder colour, so a list draws before the image arrives. */
  blurHash?: string | null;
  /** What a document stores in a `_ref`: `image-<assetId>-<w>x<h>-<ext>`. */
  reference: string;
  url: string;
  uploadedBy: string;
  createdAt: string;
}

/** What `POST /assets/upload-url` answers: where to put the bytes, and what it becomes. */
export interface AssetUploadTicket {
  assetId: string;
  /** A presigned S3 PUT. Short-lived, and the only thing that can write the object. */
  uploadUrl: string;
  /** Where the object will be readable once it is there. */
  url: string;
  reference: string;
  expiresIn: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// API tokens and webhooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A token for a machine.
 *
 * The secret is stored hashed and is **shown once**, at creation — which is why
 * `IssuedApiToken` exists beside this rather than a `token` field that is usually
 * `null` and occasionally not.
 */
export interface ApiToken {
  tokenId: string;
  projectId: string;
  name: string;
  role: ProjectRole;
  /** One dataset, or `null` for every dataset in the project. */
  dataset?: string | null;
  createdAt: string;
  createdBy: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
}

/** The one response that ever carries the secret. */
export interface IssuedApiToken extends ApiToken {
  /** `achar_<tokenId>_<secret>`. Shown once and unrecoverable. */
  token: string;
}

/** What a webhook is notified about. */
export type WebhookEvent = 'create' | 'update' | 'delete' | 'publish';

/** The events, in the order a picker should offer them. */
export const WEBHOOK_EVENTS: readonly WebhookEvent[] = ['create', 'update', 'delete', 'publish'];

/**
 * A URL told when content changes.
 *
 * `filter` and `projection` are GROQ, the same as a query: a webhook that fires on
 * every write is one a frontend rebuilds its whole site for, so the filter is what
 * makes it useful rather than merely correct.
 */
export interface Webhook {
  webhookId: string;
  projectId: string;
  dataset: string;
  name: string;
  url: string;
  on: WebhookEvent[];
  /** A GROQ filter the document must satisfy: `_type == "post"`. */
  filter?: string | null;
  /** A GROQ projection shaping what is sent. */
  projection?: string | null;
  /** Whether a signing secret is set. The secret itself is never returned. */
  hasSecret: boolean;
  enabled: boolean;
  createdAt: string;
  lastDelivery?: WebhookDelivery | null;
}

/** One attempt to deliver one event. */
export interface WebhookDelivery {
  deliveryId: string;
  webhookId: string;
  documentId: string;
  event: WebhookEvent;
  at: string;
  attempt: number;
  status: 'SUCCESS' | 'FAILED';
  statusCode?: number | null;
  durationMs: number;
  error?: string | null;
}

/** What is POSTed to a webhook's URL. */
export interface WebhookPayload {
  projectId: string;
  dataset: string;
  event: WebhookEvent;
  documentId: string;
  at: string;
  /** Shaped by the webhook's `projection`, or the whole document. */
  document: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// The envelope
// ─────────────────────────────────────────────────────────────────────────────

/** Every error the API answers with, whatever its status. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    /** Whatever the caller needs to act on — a field name, a revision, a limit. */
    details?: Record<string, unknown>;
  };
}

/** Every list, paged the same way. */
export interface ListResponse<T> {
  items: T[];
  /** Absent or null on the last page. */
  nextToken?: string | null;
}

/** A whole dataset, as `export` writes it and `import` reads it. */
export interface DatasetExport {
  projectId: string;
  dataset: string;
  exportedAt: string;
  revision: string;
  types: SchemaType[];
  documents: AcharDocument[];
  assets: Asset[];
}

/**
 * What the API is, answered without a token.
 *
 * A frontend that cannot reach the API is a blank page with a console error in it;
 * this is the one route that says *why* — which is why the console's own deploy
 * checklist ends by calling it.
 */
export interface ApiInfo {
  service: 'achar';
  version: string;
  stage: string;
  region: string;
  /** Whether the caller presented a token that resolved to a person. */
  authenticated: boolean;
}
