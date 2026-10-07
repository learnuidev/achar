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

/**
 * A content store inside a project. Documents and assets belong to one.
 *
 * **A dataset is where a language list lives.** Not a project, and not a
 * document: a language is a fact about a body of content — a site is translated
 * into Spanish and a product's release notes are not — and the dataset is the
 * boundary that decision is made at. It is also the boundary the API already
 * resolves on every request, which is what lets a read answer in one language
 * without the caller having to name the set.
 *
 * `languages` is what may be authored; `defaultLanguage` is what a value with no
 * translation is answered in, and what a localized field is read as when nobody
 * says otherwise. A dataset that has never been told is an English one, so both
 * answer something on a dataset stored before languages existed.
 */
export interface Dataset {
  projectId: string;
  /** The name in the URL and in every query — `production`. */
  datasetName: string;
  visibility: DatasetVisibility;
  /** The languages its content may be authored in. Never empty. */
  languages: string[];
  /** Which of them an untranslated value is answered in. Always one of `languages`. */
  defaultLanguage: string;
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
  | 'video'
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
  /**
   * Whether the field holds **one value per language** rather than one value.
   *
   * A localized field's stored value is an object keyed by language code —
   * `{ en: "Hello", fr: "Bonjour" }` — which is the whole of the feature: the
   * translation is a field on the document, so a document is one row in one
   * dataset with one id, one draft and one publish, whatever it has been
   * translated into.
   *
   * Which languages exist is the dataset's business, not the schema's: the same
   * type is authored against a dataset that is English only and one that is not,
   * and marking a field here says "this is worth translating" rather than "this
   * has been".
   *
   * Not allowed on an `object`: whether `{ en: …, fr: … }` is a map of languages
   * or the object's own fields is a question no reader could answer, so a whole
   * object is not translatable — its fields are, one at a time.
   */
  localized?: boolean;
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
 *
 * **A read in a language answers with that language's values in place.**
 * `?language=fr` turns every localized field into its French value, falling back
 * per field to the dataset's default language, so a consumer renders a document
 * without knowing which fields are translatable — `title` is a string, in
 * whichever language was asked for. `shape=stored` is the exception and the
 * point of it: an editor gets the maps, because authoring a translation means
 * seeing all of them.
 */
export interface AcharDocument extends DocumentStub {
  /** True when this row is the `drafts.<id>` copy rather than the published one. */
  _draft?: boolean;
  /** Whether a published version of this document exists alongside this row. */
  _published?: boolean;
  /** Whether the caller may change it, resolved on read like `Project.role`. */
  _editable?: boolean;
  /**
   * The language this answer is in — the one read, or the dataset's default when
   * none was named. Absent on a `shape=stored` read, which answers no language.
   */
  _language?: string;
  /**
   * Localized fields that have no value in `_language` and were therefore
   * answered from the default language, by dotted path — `title`, `seo.title`.
   *
   * Absent when the answer is complete, and absent on a stored read. This is the
   * "and say so" half of falling back: a site that renders `_untranslated`'s
   * fields is showing a translated page with English in it, and a build step can
   * read the same list to know what still needs translating instead of comparing
   * two documents itself.
   */
  _untranslated?: string[];
  /**
   * Where each language's values came from, and whether a person has approved
   * them — keyed by language code. See `TranslationRecord`.
   *
   * Absent on a document no model has translated, which is the ordinary case: a
   * document written in one language has no languages to keep books about. A
   * surface that draws a translation should read it, because it is the difference
   * between words a person wrote and words a model did.
   */
  _translations?: Record<string, TranslationRecord>;
  [field: string]: unknown;
}

/**
 * Where one language's values came from, and who has taken responsibility for them.
 *
 * The whole of the AI story is this record. A model may write a translation — that
 * is what `POST /v1/data/translate/…` does — but it writes it into the **draft**,
 * marked `ai` and unapproved, and **a publish is refused while any language is
 * marked that way**. So a machine can do the work and cannot ship it: the step
 * between the two is a person reading it and saying so, which is what `approve`
 * records and the only thing that clears the refusal. Approving needs a *person* —
 * a request carrying an API token is refused, because a machine cannot be the human
 * in "needs a human".
 *
 * `source: 'human'` is not a claim about who typed — this API cannot tell an editor
 * from a migration script — it is the absence of the model: values that arrived from
 * anywhere other than the translation route. What `ai` tells a reader is "a model
 * wrote the words in this language"; what `approvedBy` adds is that somebody has
 * since read them.
 *
 * An approval is of a **particular text**, so editing a language's values clears it:
 * what was approved is no longer what the row holds.
 */
export interface TranslationRecord {
  /** `ai` when the translation route wrote these values, `human` when anything else did. */
  source: 'ai' | 'human';
  /** The model, on an `ai` record — `anthropic.claude-3-5-haiku-20241022-v1:0`. */
  model?: string | null;
  /** When the values were written. ISO 8601. */
  at: string;
  /** Who approved them, or absent while nobody has. */
  approvedBy?: string | null;
  /** When they approved them, or absent. */
  approvedAt?: string | null;
}

/** What a translation did — `POST /v1/data/translate/{p}/{d}`. */
export interface TranslationResult {
  documentId: string;
  /** The language translated into. */
  language: string;
  /** The language it was translated from. */
  from: string;
  /** The model that did it, as the deployment configured it. */
  model: string;
  /** The field paths it wrote, in the schema's own spelling — `title`, `seo.note`. */
  fields: string[];
  /** Paths it left alone: a field with nothing in it to translate, an asset, a number. */
  skipped: string[];
  /** The draft as it now stands, in the stored shape — every language, maps and all. */
  document: AcharDocument;
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
  /** The language the preview was resolved in. */
  language: string;
  /** Localized fields the preview read that this language has no value for. */
  untranslated: string[];
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
  /**
   * How whole documents in the answer are shaped.
   *
   * `schema` — the default — answers them as the types that declare them: an `image`
   * field is an address, a reference is the document it names. `stored` answers the
   * rows, which is what an editor works with. A projection is left exactly as it was
   * written either way, because that shape was the client's choice.
   */
  shape?: 'schema' | 'stored';
  /**
   * The language to answer in — one of the dataset's `languages`.
   *
   * Absent means the dataset's `defaultLanguage`, so a query written before the
   * dataset had a second language reads exactly as it did. A language the dataset
   * does not have is a 400 rather than a silent fallback to the default: a typo
   * that quietly answered in English is a typo nobody finds.
   *
   * It resolves *before* the query runs, so GROQ sees a document whose localized
   * fields hold this language's values and `title` means the same thing in every
   * query. `shape: 'stored'` is the one read that leaves the maps alone.
   */
  language?: string;
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
  | 'unpublish'
  | 'restore'
  | 'approve';

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
 *
 * **`_language` says which language a plain value is in.** A localized field holds
 * one value per language, and a caller writing French should not have to know
 * which fields those are:
 *
 * ```json
 * { "patch": { "id": "post-1", "set": { "title": "Bonjour" }, "_language": "fr" } }
 * ```
 *
 * A value that is already an object is taken as the map itself and written as
 * given, key by key — which is how a caller writes two languages in one request,
 * and how a client that has read a `shape=stored` document writes it back. Absent,
 * `_language` is the dataset's `defaultLanguage`, so a write from before languages
 * existed is a write in the default one.
 *
 * It is spelled with the `_` because a schema may declare a field called
 * `language` — a post about languages has one — and a content field may never
 * begin with `_`. The marker is therefore unshadowable rather than nearly so.
 */
export interface DocumentMutation {
  create?: { _id?: string; _type: string; _language?: string; [field: string]: unknown };
  createOrReplace?: { _id: string; _type: string; _language?: string; [field: string]: unknown };
  createIfNotExists?: { _id: string; _type: string; _language?: string; [field: string]: unknown };
  patch?: {
    id: string;
    /** The language the plain values here are in. See this type's own note. */
    _language?: string;
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
  /**
   * Put an earlier published version back, as the draft.
   *
   * The draft, and not the published row: what a site serves is what somebody
   * chose to publish, and a restore that went straight to it would make reading
   * a version a way to change production. Restoring is therefore reviewable —
   * `publish` is the next step, and it is the one that changes the site.
   */
  restore?: { id: string; version: number };
  /**
   * Take responsibility for a language a model translated.
   *
   * `approve` changes no content: it records that a person has read the values in
   * those languages and stands behind them, which is the one thing that lets a
   * document holding AI translations be published. It is a write of its own rather
   * than a side effect of a save, because "somebody edited this" and "somebody
   * vouched for this" are different facts and only the second one is an approval.
   *
   * A language the document has no `ai` record for is refused rather than ignored:
   * approving English, which no model wrote, would be a person signing something
   * nobody asked them to sign.
   */
  approve?: { id: string; languages: string[] };
}

/**
 * One published version of a document, kept as it was at the moment it was published.
 *
 * A version is a snapshot rather than a diff: a diff is smaller and needs two
 * versions to be readable, and the thing anybody asks of history is "show me what
 * it said", which is a question a snapshot answers on its own.
 */
export interface DocumentVersion {
  documentId: string;
  /** 1 for the first publish of a document, and one more for every publish after it. */
  version: number;
  publishedAt: string;
  /** The `sub` of whoever published it, or a token's id. Absent on older versions. */
  publishedBy?: string | null;
  /** The revision the publish produced — the same `_rev` a client saw afterwards. */
  rev: string;
  /** The document as it was: what `GET /v1/data/doc/…` would have answered then. */
  document: AcharDocument;
}

/** What a history list draws, without the documents. */
export interface DocumentVersionSummary {
  documentId: string;
  version: number;
  publishedAt: string;
  publishedBy?: string | null;
  rev: string;
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

export type AssetKind = 'image' | 'video' | 'file';

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
  /**
   * Images and videos, read at upload time by the studio.
   *
   * For a video these are the frame size, and they are worth keeping for the reason
   * an image's are: a page can hold the right space for something that has not
   * arrived yet, and a video that reflows the whole layout when it loads is worse
   * than one that does not play for a second.
   */
  width?: number | null;
  height?: number | null;
  /** A CSS placeholder colour, so a list draws before the image arrives. */
  blurHash?: string | null;
  /** What a document stores in a `_ref`: `image-<assetId>-<w>x<h>-<ext>`, `video-…`. */
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
  /**
   * The languages the documents are in, and which one is the default.
   *
   * Here because an export is the whole of a dataset: the documents carry one
   * value per language, and a file that arrived without the list would be a
   * corpus whose keys mean nothing.
   */
  languages: string[];
  defaultLanguage: string;
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
