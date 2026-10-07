/**
 * The API reference, as data.
 *
 * The page renders this; nothing about the layout is in here and nothing about
 * the API is in the page. It is one file rather than prose inside a component
 * because a reference is read by whoever changes the API: the way to keep the docs
 * true is for the endpoint that changed to be a field somebody has to walk past, in
 * a list they can see the bottom of — and the list below is the routes an **API
 * token** reaches, in the order a reader needs them.
 *
 * **This reference is scoped to one of the API's two credentials, deliberately.**
 * Achar accepts a signed-in person's Cognito ID token, which API Gateway checks
 * before any handler runs, and an API token, which the handler verifies itself
 * because a gateway authorizer only understands Cognito. Every route the second one
 * reaches is here; the management routes — projects, datasets, schemas, members,
 * tokens, webhooks — take a person's session and are documented where they are used,
 * which is the studio. A reference that listed both would be a page where half the
 * cards say "you cannot call this from here", and half the rail is noise to anybody
 * reading it with a token.
 *
 * So `auth` has two values here and every card has a playground: `none` for the one
 * route nobody is asked about, `token` for the rest.
 */

/** A field or parameter, as a card documents it. */
export interface ApiField {
  name: string;
  type: string;
  required?: boolean;
  description: string;
  /** What goes in the generated example, and in the playground's empty box. */
  example?: string;
}

export interface ApiParameter extends ApiField {
  in: 'path' | 'query';
}

/**
 * Who may call it, and where that is decided.
 *
 * - `none` — nobody is asked. `GET /v1/info` exists precisely so a deployment can
 *   be asked whether it is up.
 * - `token` — an API token (`achar_<tokenId>_<secret>`), verified **by the
 *   handler**. This is what a script, a build server or a site uses, and it is the
 *   only credential this page can hold, which is why the whole reference is the set
 *   of routes it reaches.
 */
export type ApiAuth = 'none' | 'token';

export interface ApiEndpoint {
  /** The anchor it is linked by, and what the rail scrolls to. */
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  summary: string;
  /** A sentence or two on what it is for, and anything surprising about it. */
  description: string;
  auth: ApiAuth;
  parameters?: ApiParameter[];
  body?: ApiField[];
  /** The status it answers with, e.g. `200 OK`. */
  responseStatus: string;
  /** The JSON it answers with, exactly as it arrives. Absent when there is none. */
  responseExample?: string;
  responseFields?: ApiField[];
  /** Caveats that change how the answer should be read. */
  notes?: string[];
}

export interface ApiEndpointGroup {
  id: string;
  title: string;
  description: string;
  endpoints: ApiEndpoint[];
}

const PROJECT_ID: ApiParameter = {
  in: 'path',
  name: 'projectId',
  type: 'string',
  required: true,
  description: 'What a project is addressed by — `proj_` and twelve characters.',
  example: 'proj_647baf1fe6b1',
};

const DATASET: ApiParameter = {
  in: 'path',
  name: 'dataset',
  type: 'string',
  required: true,
  description:
    'A dataset in that project. Lowercase letters, digits, `_` and `-`, up to 64 characters — `production` is the usual first one.',
  example: 'production',
};

const DOCUMENT_ID: ApiParameter = {
  in: 'path',
  name: 'documentId',
  type: 'string',
  required: true,
  description: 'A document, by its own id. The `drafts.`-prefixed id is accepted and means the same document.',
  example: 'pricing-v2',
};

const PERSPECTIVE: ApiParameter = {
  in: 'query',
  name: 'perspective',
  type: '"published" | "previewDrafts" | "raw"',
  description:
    'Which of a document’s two rows to read. Defaults to `published`, which is what a site serves; `previewDrafts` is the draft when there is one, and `raw` is “whatever exists”.',
  example: 'published',
};

const NEXT_TOKEN: ApiParameter = {
  in: 'query',
  name: 'nextToken',
  type: 'string',
  description:
    'The page to read next, taken from the previous response. Opaque — pass it back unchanged, and stop when it is absent.',
};

const LIMIT: ApiParameter = {
  in: 'query',
  name: 'limit',
  type: 'integer',
  description: 'How many to answer with. The API has its own ceiling and will not go past it.',
  example: '20',
};

/**
 * How much of a document to resolve.
 *
 * The one parameter on this API that changes a *shape* rather than selecting data,
 * and it is here because there are two honest answers and they are for different
 * readers: a site renders a type, an editor edits a row.
 */
const SHAPE: ApiParameter = {
  in: 'query',
  name: 'shape',
  type: '"schema" | "stored"',
  description:
    'Defaults to `schema`: a document as the type that declares it — an asset field is its CDN address, a reference is the document it names, resolved one level. `stored` answers the row: an asset reference and a `{_ref}`. The studio asks for `stored`, because it edits references rather than the documents they name.',
  example: 'schema',
};

const DOCUMENT_FIELDS: ApiField[] = [
  { name: '_id', type: 'string', description: 'The document’s id, unprefixed.' },
  { name: '_type', type: 'string', description: 'The content type it is, which is what the schema calls it.' },
  { name: '_rev', type: 'string', description: 'The revision this write produced. Two clients compare it to notice a change.' },
  { name: '_createdAt', type: 'string', description: 'ISO 8601. When the document first existed.' },
  { name: '_updatedAt', type: 'string', description: 'ISO 8601. When this row was last written.' },
  { name: '_draft', type: 'boolean', description: 'True when this is the `drafts.<id>` row.' },
  { name: '_published', type: 'boolean', description: 'Whether a published row exists beside it.' },
  { name: '_editable', type: 'boolean', description: 'Whether the caller may change it, resolved on read like `Project.role`.' },
];

export const API_ENDPOINT_GROUPS: ApiEndpointGroup[] = [
  {
    id: 'service',
    title: 'Service',
    description:
      'What the deployment is. This is where a client starts, because it is the one route that answers without a credential — and because the stage and version it names are what a bug report should carry.',
    endpoints: [
      {
        id: 'info',
        method: 'GET',
        path: '/v1/info',
        summary: 'The service itself',
        description:
          'Name, version, stage and region. Anonymous on purpose: a deployment that cannot be asked whether it is up is a deployment somebody debugs by guessing.',
        auth: 'none',
        responseStatus: '200 OK',
        responseExample: `{
  "name": "achar",
  "version": "1.0.0",
  "stage": "dev",
  "region": "us-east-1"
}`,
        notes: [
          'There is no `GET /v1/health`. This is it: a route that answers means the handler ran, which is the only health a Lambda has.',
          'The version is baked into every function at deploy time, so it says which deployment answered rather than what the repository looks like.',
        ],
      },
    ],
  },
  {
    id: 'content',
    title: 'Reading content',
    description:
      'The half of the API a site calls. These routes take an **API token**, and every one of them is a read of a dataset — the query language, a page of a list, one document, and the history of one.',
    endpoints: [
      {
        id: 'query',
        method: 'GET',
        path: '/v1/data/query/{projectId}/{dataset}',
        summary: 'Run a GROQ query',
        description:
          'The whole point of the API: one query language over a dataset, with parameters, at one of three perspectives. The query is a query parameter rather than a body, so it can be pasted into a browser or a `curl` and read back.',
        auth: 'token',
        parameters: [
          PROJECT_ID,
          DATASET,
          {
            in: 'query',
            name: 'query',
            type: 'string',
            required: true,
            description: 'The GROQ query. See the subset this service implements, below.',
            example: '*[_type == "post"] | order(publishedAt desc)[0...10]',
          },
          {
            in: 'query',
            name: 'params',
            type: 'JSON object',
            description:
              'What `$name` in the query resolves to, as JSON. Parameters rather than interpolation, so that a value can never be read as syntax.',
            example: '{"type":"post"}',
          },
          PERSPECTIVE,
          SHAPE,
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "result": [
    {
      "_id": "hello-world",
      "_type": "post",
      "title": "Hello world",
      "_rev": "01JQ8Z…",
      "_createdAt": "2026-02-14T11:02:00.000Z",
      "_updatedAt": "2026-03-01T09:00:00.000Z",
      "title": "Hello world",
      "coverImage": "https://cdn.example/assets/…/cover.png",
      "author": { "_id": "maya", "_type": "author", "name": "Maya" },
      "body": [
        {
          "_type": "block",
          "style": "normal",
          "markDefs": [],
          "_key": "fk4eroz868mq",
          "children": [
            { "_type": "span", "marks": [], "text": "this is a body", "_key": "wq7qoisnecmv" }
          ]
        }
      ]
    }
  ],
  "ms": 12,
  "perspective": "published",
  "documentsRead": 1
}`,
        responseFields: [
          { name: 'result', type: 'any', description: 'What the query asked for. A projection, a count, a single document — whatever the query says.' },
          { name: 'ms', type: 'integer', description: 'How long the read took, for the one screen that draws it.' },
          { name: 'perspective', type: '"published" | "previewDrafts" | "raw"', description: 'The perspective the answer was resolved at — the one asked for, or the default.' },
          { name: 'documentsRead', type: 'integer', description: 'How many documents the query read, not how many it returned.' },
        ],
        notes: [
          'A **projection** is answered exactly as it was written: `{title, "author": author->name}` is those two fields, and shaping does not touch a shape you chose. Whole documents — anything carrying a `_type` — are the ones shaped.',
          'The GROQ subset is stated in `services/api/src/lib/groq`: `*`, filters, `&&`, `||`, `!`, comparisons, `in`, `match`, `defined()`, `count()`, `order()`, slices, projections, `->`, `^`, `$param` and the pipe operator. Anything outside it is a **400 naming the position**, never a silently empty result.',
          'A query that reads a `previewDrafts` perspective sees drafts; the default does not.',
          '**A whole document is answered as the type that declares it.** An `image`, `video` or `file` field is the full CDN address as a string, and a reference field — `author` — is the document it names, resolved one level: the author’s own asset fields are addresses and its references stay references. `null` means the thing pointed at is gone. Ask for `shape=stored` to get the rows instead, which is what an editor works with.',
          '**A field that is portable text is answered in its canonical form**: a block’s text is one span per run of marks, not one span per keystroke. `"this is a body"` is one span, and a `strong` phrase inside it is a second — which is the shape the schema describes and the one a person can read.',
        ],
      },
      {
        id: 'list-documents',
        method: 'GET',
        path: '/v1/data/list/{projectId}/{dataset}',
        summary: 'A page of documents of one type',
        description:
          'What a studio’s list draws: the documents of one `_type`, newest first, each with the name and image the schema’s preview resolves for it. It exists beside the query route because a list needs things a query would have to re-derive — preview titles, whether a draft exists beside the published row, and a page token rather than an offset.',
        auth: 'token',
        parameters: [
          PROJECT_ID,
          DATASET,
          { in: 'query', name: 'type', type: 'string', required: true, description: 'The `_type` to list.', example: 'post' },
          LIMIT,
          NEXT_TOKEN,
          { in: 'query', name: 'search', type: 'string', description: 'Filters the page by the text the preview draws.' },
          { in: 'query', name: 'order', type: 'string', description: 'One of the type’s declared orderings, by name.' },
          PERSPECTIVE,
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "items": [
    {
      "_id": "hello-world",
      "_type": "post",
      "_rev": "01JQ8Z…",
      "_updatedAt": "2026-03-01T09:00:00.000Z",
      "hasDraft": false,
      "published": true,
      "title": "Hello world"
    }
  ],
  "nextToken": null
}`,
        notes: [
          '`search` and `order` are page-scoped. Sorting a whole dataset by a field would need an index the table does not have, and the honest answer past one page is a `query`.',
        ],
      },
      {
        id: 'get-document',
        method: 'GET',
        path: '/v1/data/doc/{projectId}/{dataset}/{documentId}',
        summary: 'One document',
        description:
          'A document by id, at one perspective. `published` is the default because that is what a site serves; an editor asks for `previewDrafts` by name.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET, DOCUMENT_ID, PERSPECTIVE, SHAPE],
        responseStatus: '200 OK',
        responseExample: `{
  "_id": "hello-world",
  "_type": "post",
  "_rev": "01JQ8Z…",
  "_createdAt": "2026-02-14T11:02:00.000Z",
  "_updatedAt": "2026-03-01T09:00:00.000Z",
  "_draft": false,
  "_published": true,
  "_editable": false,
  "title": "Hello world",
  "coverImage": "https://cdn.example/assets/…/cover.png",
  "author": { "_id": "maya", "_type": "author", "name": "Maya" }
}`,
        responseFields: DOCUMENT_FIELDS,
        notes: [
          'A document that exists only as a draft answers **404** at `published` rather than an empty body, because that is what it is: not published, and not a thing this caller can be told about.',
          'Shaped as the type that declares it, by default: an asset field is its CDN address as a string, and a reference field is the document it names. `shape=stored` answers the row instead — an asset reference and a `{_ref}` — which is what the studio reads and writes.',
          'A field that is portable text is answered in its canonical form: one span per run of marks.',
        ],
      },
      {
        id: 'mutate',
        method: 'POST',
        path: '/v1/data/mutate/{projectId}/{dataset}',
        summary: 'An ordered batch of writes',
        description:
          'The write half: a batch of mutations applied in order. The batch is the unit rather than the request, because a `create` followed by a `patch` of the same document is how a client saves a document it has just made, and splitting that into two requests leaves a half-made document behind whenever the second fails.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET],
        body: [
          {
            name: 'mutations',
            type: 'Mutation[]',
            required: true,
            description:
              'Each element names exactly one operation: `create`, `createOrReplace`, `createIfNotExists`, `patch`, `delete`, `publish`, `unpublish`, `restore`.',
            example: '[{"createIfNotExists":{"_id":"drafts.pricing","_type":"pricing"}},{"patch":{"id":"drafts.pricing","set":{"title":"Pricing"}}}]',
          },
          {
            name: 'atomic',
            type: 'boolean',
            description: 'Fail the whole batch rather than applying what can be applied. One transaction.',
          },
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "results": [
    { "documentId": "pricing", "operation": "create", "rev": "01JQ8Z…" },
    { "documentId": "pricing", "operation": "patch", "rev": "01JQ8ZA…" }
  ],
  "transactionId": "01JQ8ZB…"
}`,
        notes: [
          '**A mutation never writes the published row directly.** `create`, `createOrReplace`, `createIfNotExists`, `patch` and `restore` write the *draft*; `publish` is what moves a draft onto the published id, and `unpublish` takes it back off. That is why publishing is a step somebody takes rather than a side effect of typing.',
          'A **draft may be missing a required field** — that is what a draft is for. Publishing is where a document has to be whole, and it is refused with the fields it is missing.',
          'Every publish is recorded: `GET …/versions` is the history of what a document has said, and `restore` puts one of those back as the draft.',
          'A token needs the `EDITOR` role or better to write. See **Tokens** for what a role reaches.',
        ],
      },
      {
        id: 'list-versions',
        method: 'GET',
        path: '/v1/data/doc/{projectId}/{dataset}/{docId}/versions',
        summary: 'Every time a document was published',
        description:
          'The history, newest first: `v1` is the first publish and the number goes up by one each time. Summaries rather than documents, because a history is a list somebody scrolls and a document with forty versions is forty documents of portable text to draw some dates.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET, DOCUMENT_ID],
        responseStatus: '200 OK',
        responseExample: `[
  { "documentId": "pricing", "version": 2, "publishedAt": "2026-03-02T10:00:00.000Z", "publishedBy": "a1b2c3…", "rev": "01JQ9A…" },
  { "documentId": "pricing", "version": 1, "publishedAt": "2026-03-01T09:00:00.000Z", "publishedBy": "a1b2c3…", "rev": "01JQ8Z…" }
]`,
        notes: [
          'A version is written once and never changes. The policy on the table it lives in grants no `UpdateItem` at all, so a history cannot be rewritten even by mistake.',
          '`publishedBy` is the `sub` of whoever published it — absent on versions written before history existed.',
        ],
      },
      {
        id: 'get-version',
        method: 'GET',
        path: '/v1/data/doc/{projectId}/{dataset}/{docId}/versions/{version}',
        summary: 'One version, as it was',
        description:
          'The document exactly as a client would have read it at the moment it was published: the same fields, the same `_rev`, the same `_updatedAt`. Anything derived on the way out would be a version seen through today’s code, and “what did this say in March” is a question about March.',
        auth: 'token',
        parameters: [
          PROJECT_ID,
          DATASET,
          DOCUMENT_ID,
          { in: 'path', name: 'version', type: 'integer', required: true, description: 'The version number, from the history.', example: '1' },
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "documentId": "pricing",
  "version": 1,
  "publishedAt": "2026-03-01T09:00:00.000Z",
  "publishedBy": "a1b2c3…",
  "rev": "01JQ8Z…",
  "document": { "_id": "pricing", "_type": "pricing", "title": "Pricing" }
}`,
        notes: [
          'Deleting a document takes its history with it: a snapshot of something that no longer exists is a version nothing can be restored into.',
        ],
      },
    ],
  },
  {
    id: 'assets',
    title: 'Assets',
    description:
      'Images, videos and files. **The bytes never pass through a handler**: an upload claims a ticket, PUTs straight to S3, and commits the metadata. That is what makes a forty-megabyte video an ordinary upload rather than a Lambda’s memory problem.',
    endpoints: [
      {
        id: 'list-assets',
        method: 'GET',
        path: '/v1/assets/{projectId}/{dataset}',
        summary: 'The asset library',
        description: 'The dataset’s assets, paged, and filterable by kind.',
        auth: 'token',
        parameters: [
          PROJECT_ID,
          DATASET,
          { in: 'query', name: 'kind', type: '"image" | "video" | "file"', description: 'Only this kind. Absent means all three.' },
          LIMIT,
          NEXT_TOKEN,
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "items": [
    {
      "assetId": "01JQ8Z…",
      "kind": "image",
      "filename": "cover.png",
      "contentType": "image/png",
      "size": 84213,
      "width": 1200,
      "height": 800,
      "reference": "image-01JQ8Z…-1200x800-png",
      "url": "https://cdn.example/images/…/cover.png"
    }
  ],
  "nextToken": null
}`,
        responseFields: [
          { name: 'reference', type: 'string', description: 'What a document stores in a field. `image-<assetId>-<w>x<h>-<ext>`, `video-…`, `file-<assetId>-<ext>`.' },
          { name: 'url', type: 'string', description: 'The CDN address, built on read rather than stored — so a distribution that moves does not orphan every document pointing at it.' },
        ],
      },
      {
        id: 'create-asset-upload-url',
        method: 'POST',
        path: '/v1/assets/{projectId}/{dataset}/upload-url',
        summary: 'Reserve an asset and presign a PUT',
        description:
          'Step one of an upload: the row is reserved, and the answer carries a URL that S3 itself accepts for a few minutes. Step two is the PUT of the bytes to that URL — no credential of ours goes with it.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET],
        body: [
          { name: 'filename', type: 'string', required: true, description: 'What the file is called. It becomes the extension on the reference.', example: 'cover.png' },
          { name: 'contentType', type: 'string', required: true, description: 'The MIME type the PUT will declare. It must match what the PUT sends.', example: 'image/png' },
          { name: 'kind', type: '"image" | "video" | "file"', required: true, description: 'Which half of the library it belongs in.', example: 'image' },
          { name: 'size', type: 'integer', required: true, description: 'How many bytes are about to be sent.', example: '84213' },
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "assetId": "01JQ8Z…",
  "uploadUrl": "https://achar-dev-assets.s3.us-east-1.amazonaws.com/assets/…?X-Amz-Signature=…",
  "expiresIn": 900
}`,
        notes: [
          'Write the ticket with `ClientRequestToken`-style care: a reservation that is never committed is a row with no bytes, and uploading again mints a new asset id rather than repairing the old one.',
        ],
      },
      {
        id: 'commit-asset',
        method: 'POST',
        path: '/v1/assets/{projectId}/{dataset}',
        summary: 'Commit the metadata after the PUT',
        description:
          'Step three. The bytes are in the bucket and this is what makes them an asset: the row is marked committed and the dimensions are recorded. The dimensions are sent by the client because the browser is where the image — or the video’s first frame — is already decoded.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET],
        body: [
          { name: 'assetId', type: 'string', required: true, description: 'The id the ticket answered with.', example: '01JQ8Z…' },
          { name: 'width', type: 'integer', description: 'Images and videos. For a video it is the frame size, which is what lets a page hold the space before the first frame arrives.', example: '1200' },
          { name: 'height', type: 'integer', description: 'The other half of the frame.', example: '800' },
          { name: 'blurHash', type: 'string', description: 'A placeholder colour or hash, so a list can draw before the image arrives.' },
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "assetId": "01JQ8Z…",
  "kind": "image",
  "reference": "image-01JQ8Z…-1200x800-png",
  "url": "https://cdn.example/images/…/cover.png"
}`,
        notes: ['Committing twice is not an error: the second answer is the asset as it already stands.'],
      },
      {
        id: 'delete-asset',
        method: 'DELETE',
        path: '/v1/assets/{projectId}/{dataset}/{assetId}',
        summary: 'Delete an asset',
        description:
          'The object and its row. Documents that referenced it keep the reference they were written with, and draw a placeholder from then on.',
        auth: 'token',
        parameters: [
          PROJECT_ID,
          DATASET,
          { in: 'path', name: 'assetId', type: 'string', required: true, description: 'The asset, by the id in its reference.', example: '01JQ8Z…' },
        ],
        responseStatus: '204 No Content',
        notes: [
          'Uploading the same file again mints a **new** asset id. It does not repair the documents that point at the old one.',
        ],
      },
    ],
  },
  {
    id: 'types',
    title: 'Content types',
    description:
      'A dataset starts with **no content types**, because what it holds is the dataset’s own decision. This is how one gets written from outside the studio — the same route the studio’s type editor calls, so a schema built by a script and a schema built by hand are the same schema.',
    endpoints: [
      {
        id: 'create-type',
        method: 'POST',
        path: '/v1/schema/{projectId}/{dataset}/types',
        summary: 'Add or replace one content type',
        description:
          'One type, not the whole schema. That is the difference that matters: a caller sending a whole `types` array has to have read it first, and two editors doing that at once lose one of the two types. The API merges instead — reading, merging, and writing only if the revision it read is still the one there — so two of these are applied one after the other rather than one over the other.',
        auth: 'token',
        parameters: [PROJECT_ID, DATASET],
        body: [
          {
            name: 'name',
            type: 'string',
            required: true,
            description:
              'What the type is filed under, and what a document of it stores as `_type`. A TypeScript identifier, because it is the name your queries write.',
            example: 'post',
          },
          { name: 'title', type: 'string', description: 'What the studio calls it. Absent means the name, made readable — `post` becomes `Post`.', example: 'Blog post' },
          { name: 'kind', type: '"document" | "object"', description: 'Absent means `document`. An `object` is a type that is only ever a field of another type — an address, a link.', example: 'document' },
          { name: 'icon', type: 'string', description: 'A lucide icon name, drawn beside the type in the studio.', example: 'FileText' },
          { name: 'description', type: 'string', description: 'A sentence for whoever reads this schema next.' },
          {
            name: 'fields',
            type: 'SchemaField[]',
            required: true,
            description:
              'What a document of this type holds, in the order a form draws them. Each is `{ name, title, type }` plus whatever that type needs — `options` for a picker, `of` for an array, `to` for a reference, `required` for one a publish is refused without.',
            example: '[{ "name": "title", "title": "Title", "type": "string", "required": true }]',
          },
          {
            name: 'replaces',
            type: 'string',
            description:
              'The name this write stands in for: an edit, or a rename. **Absent, the write only adds** — a name already in the schema is a `409` rather than a quiet overwrite. Present, it is an upsert, which is what makes a bootstrap script safe to run twice.',
            example: 'post',
          },
        ],
        responseStatus: '201 Created · 200 OK',
        responseExample: `{
  "projectId": "proj_647baf1fe6b1",
  "dataset": "production",
  "types": [
    {
      "name": "post",
      "title": "Blog post",
      "kind": "document",
      "icon": "FileText",
      "fields": [
        { "name": "title", "title": "Title", "type": "string", "required": true }
      ]
    }
  ],
  "revision": "9f2c1a…",
  "updatedAt": "2026-03-01T09:00:00.000Z"
}`,
        responseFields: [
          { name: 'types', type: 'SchemaType[]', description: 'Every type the dataset has now, not only the one written, in the order the studio draws them.' },
          { name: 'revision', type: 'string', description: 'A hash of `types`. It changes when they change and not otherwise, which is what the next write is made conditional on.' },
          { name: 'updatedAt', type: 'string', description: 'ISO 8601. When this schema row was last written.' },
        ],
        notes: [
          '**201 means it added a type; 200 means it replaced one** — so a second run of a bootstrap script can tell that it is a second run.',
          'Without `replaces`, a name that is already taken answers **409 `TYPE_EXISTS`**. A create that stood in for an existing type would be a create that destroys one, with one typo and nothing in the answer to say so.',
          'The parts of a type this body does not speak for — `preview`, `orderings` and `groups` — are carried across a replace from what is stored. But a field the type you sent leaves out is cleared, so an edit can remove a description as well as set one.',
          'A rename is a `replaces` whose `name` differs. The name a type is filed under is its identity, so a rename is this type arriving where that one was rather than an edit to a field — and renaming onto a name another type already holds is refused, because a schema may not repeat one.',
        ],
      },
    ],
  },
];

/** Every endpoint, flat — what the rail, the playground and the page all read. */
export const API_ENDPOINTS: ApiEndpoint[] = API_ENDPOINT_GROUPS.flatMap(
  (group) => group.endpoints,
);

/** The errors every route answers with, in the envelope they arrive in. */
export const API_ERROR_EXAMPLE = `{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Pricing is not valid",
    "details": {
      "issues": [ { "path": "title", "message": "is required" } ]
    }
  }
}`;

export interface ApiErrorDoc {
  status: number;
  code: string;
  meaning: string;
}

/**
 * The codes, and which of them are worth handling.
 *
 * One envelope for every failure — `{ error: { code, message, details } }` — so a
 * client parses one shape whether the answer was a 400 from a handler or a 401 from
 * the gateway. `message` is written for a person and is safe to show; `code` is
 * what a program branches on.
 */
export const API_ERRORS: ApiErrorDoc[] = [
  { status: 400, code: 'BAD_REQUEST', meaning: 'The request is malformed — a missing field, a body that is not JSON, a query that does not parse. `details` says which.' },
  { status: 400, code: 'VALIDATION_FAILED', meaning: 'The document does not satisfy its schema. `details.issues` lists every field that is wrong, not just the first.' },
  { status: 400, code: 'UNKNOWN_TYPE', meaning: 'The document names a `_type` the dataset’s schema does not declare. `details.types` lists the ones it does.' },
  { status: 401, code: 'UNAUTHORIZED', meaning: 'No credential, or one that is not valid — an expired session, a revoked token, a token presented to a route that takes a person’s session.' },
  { status: 403, code: 'FORBIDDEN', meaning: 'A valid credential that may not do this. A project that does not exist and a project the caller is not in both answer 403, so that a stranger cannot walk the id space.' },
  { status: 404, code: 'NOT_FOUND', meaning: 'The project, dataset or document is not there — or exists only as a draft, at the `published` perspective.' },
  { status: 409, code: 'CONFLICT', meaning: 'A document changed while this batch was being prepared. Compare `_rev` and retry.' },
  { status: 409, code: 'DATASET_EXISTS', meaning: 'A dataset with that name is already in the project. Dataset names are unique within a project.' },
  { status: 429, code: 'TOO_MANY_REQUESTS', meaning: 'The service is throttling reads. Retry with a delay.' },
  { status: 500, code: 'INTERNAL_ERROR', meaning: 'A bug. The request id in the response header is what finds it in CloudWatch.' },
];

/** The things worth saying once, rather than on ten cards. */
export const API_CONVENTIONS: string[] = [
  'Everything is under `/v1`. Every route needs a bearer token — an API token or a person’s ID token — **except `GET /v1/info`**, which exists so a deployment can be asked whether it is up.',
  'The credential goes in `Authorization: Bearer <token>`, for both kinds. Which kind you hold decides which routes you can reach, and a route answers `401` rather than pretending a token is a session.',
  'Bodies are JSON, and so are answers. Timestamps are ISO 8601 strings; durations are milliseconds.',
  'Lists are paged by an opaque `nextToken` rather than by an offset, and a page answers with `nextToken: null` when it is the last one.',
  'Errors are one envelope — see below — and `code` is the part a program should branch on. `message` is written for a person.',
  'Documents are written as documents, not as fields: `mutate` takes operations rather than a shape per endpoint, and a publish is an operation rather than a flag.',
  'A whole document is answered **as the type that declares it** — assets as addresses, references as the documents they name — and `?shape=stored` answers the row instead. It is the one parameter that changes a shape rather than selecting data, and it exists because a site and an editor want different things from the same document.',
];
