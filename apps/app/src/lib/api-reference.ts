/**
 * The API reference, as data.
 *
 * The page renders this; nothing about the layout is in here and nothing about
 * the API is in the page. It is one file rather than prose inside a component
 * because a reference is read by whoever changes the API: the way to keep the docs
 * true is for the endpoint that changed to be a field somebody has to walk past, in
 * a list they can see the bottom of — and the list below is the route table in
 * `infra/src/generated/service.ts`, in the order a reader needs it.
 *
 * **`auth` is the split that decides everything on this page.** Achar accepts two
 * kinds of caller and verifies them in two different places (see
 * `docs/architecture.md`): a signed-in *person*, whose Cognito ID token the API
 * Gateway checks before any handler runs, and an *API token*, which the handler
 * verifies itself because a gateway authorizer only understands Cognito. So
 * `person` routes cannot be called from a page like this one — a visitor has no
 * session here — and `token` routes can, which is what the playground offers.
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
 *   only credential a page like this can hold — so these are the endpoints with a
 *   playground.
 * - `person` — a signed-in person's Cognito ID token, verified **at the gateway**.
 *   The studio and the console call these; an API token is refused before any
 *   handler runs, which is why the reference says so rather than leaving somebody
 *   to discover it as a 401.
 */
export type ApiAuth = 'none' | 'token' | 'person';

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
          'The GROQ subset is stated in `services/api/src/lib/groq`: `*`, filters, `&&`, `||`, `!`, comparisons, `in`, `match`, `defined()`, `count()`, `order()`, slices, projections, `->`, `^`, `$param` and the pipe operator. Anything outside it is a **400 naming the position**, never a silently empty result.',
          'A query that reads a `previewDrafts` perspective sees drafts; the default does not.',
          '**A field that holds an asset is answered with its address.** An `image`, `video` or `file` field comes back as its reference *and* a `url` — the full CDN address of the bytes — at any depth in a projection, so a client draws a picture without a second request. The reference is kept because that is what can be written back; an address baked into a document stops working when the distribution changes.',
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
        parameters: [PROJECT_ID, DATASET, DOCUMENT_ID, PERSPECTIVE],
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
  "title": "Hello world"
}`,
        responseFields: DOCUMENT_FIELDS,
        notes: [
          'A document that exists only as a draft answers **404** at `published` rather than an empty body, because that is what it is: not published, and not a thing this caller can be told about.',
          'An `image`, `video` or `file` field carries a `url` beside its reference — the full CDN address — so the answer can be drawn without a second request.',
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
    id: 'projects',
    title: 'Projects and datasets',
    description:
      'The management API, in the order a project comes into being: the project, the datasets inside it, and the schema each dataset is authored against. These routes take **a signed-in person’s token** — an API token is refused at the gateway, before any handler runs.',
    endpoints: [
      {
        id: 'list-projects',
        method: 'GET',
        path: '/v1/projects',
        summary: 'The projects you are in',
        description: 'Every project the caller is an active member of, each carrying their own role in it.',
        auth: 'person',
        responseStatus: '200 OK',
        responseExample: `[
  {
    "projectId": "proj_647baf1fe6b1",
    "name": "Mandarino",
    "slug": "mandarino-78c080",
    "organizationName": "Mandarino",
    "ownerId": "a1b2c3…",
    "memberCount": 3,
    "datasetCount": 1,
    "createdAt": "2026-03-01T09:00:00.000Z",
    "updatedAt": "2026-03-01T09:00:00.000Z",
    "role": "ADMIN"
  }
]`,
        notes: ['`role` is resolved from the caller’s own membership on every read rather than stored, so a screen never has to make a second request to decide what to draw.'],
      },
      {
        id: 'create-project',
        method: 'POST',
        path: '/v1/projects',
        summary: 'Make a project',
        description:
          'The caller becomes its owner and its admin. A project and its owner’s membership are written in **one transaction**, because a project with no admin is a project nobody can administer, cannot be deleted through the API, and cannot be repaired by any route this service offers.',
        auth: 'person',
        body: [
          { name: 'name', type: 'string', required: true, description: 'What the project is called. Up to 120 characters.', example: 'Mandarino' },
          { name: 'organizationName', type: 'string', description: 'Who it belongs to on paper. Defaults to the project’s own name.', example: 'Mandarino' },
        ],
        responseStatus: '201 Created',
        responseExample: `{
  "projectId": "proj_647baf1fe6b1",
  "name": "Mandarino",
  "slug": "mandarino-78c080",
  "organizationName": "Mandarino",
  "ownerId": "a1b2c3…",
  "memberCount": 1,
  "datasetCount": 0,
  "createdAt": "2026-03-01T09:00:00.000Z",
  "updatedAt": "2026-03-01T09:00:00.000Z",
  "role": "ADMIN"
}`,
        notes: [
          'A **new project has no content types**. Achar used to answer a dataset with Achar’s own marketing model in it, and that was the wrong answer to give anybody: what a dataset holds is the dataset owner’s decision, written as TypeScript or read from a sample of their data.',
        ],
      },
      {
        id: 'get-project',
        method: 'GET',
        path: '/v1/projects/{projectId}',
        summary: 'One project',
        description: 'The project, with the caller’s role in it.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `{
  "projectId": "proj_647baf1fe6b1",
  "name": "Mandarino",
  "slug": "mandarino-78c080",
  "organizationName": "Mandarino",
  "ownerId": "a1b2c3…",
  "memberCount": 3,
  "datasetCount": 1,
  "createdAt": "2026-03-01T09:00:00.000Z",
  "updatedAt": "2026-03-02T10:00:00.000Z",
  "role": "ADMIN"
}`,
      },
      {
        id: 'update-project',
        method: 'PATCH',
        path: '/v1/projects/{projectId}',
        summary: 'Rename a project, or describe it',
        description: 'Admins only. The slug follows the name, because a slug that disagreed with its name would be a name whose links are wrong forever.',
        auth: 'person',
        parameters: [PROJECT_ID],
        body: [
          { name: 'name', type: 'string', description: 'The new name. The slug follows it.', example: 'Mandarino Docs' },
          { name: 'organizationName', type: 'string', description: 'Who it belongs to on paper.' },
          { name: 'description', type: 'string', description: 'What the project says about itself. Written by this route and not carried on `Project`.' },
        ],
        responseStatus: '200 OK',
        responseExample: `{ "projectId": "proj_647baf1fe6b1", "name": "Mandarino Docs", "slug": "mandarino-docs-78c080", "role": "ADMIN" }`,
      },
      {
        id: 'delete-project',
        method: 'DELETE',
        path: '/v1/projects/{projectId}',
        summary: 'Delete a project and everything under it',
        description:
          'Any admin of the project, and never an API token — a machine credential that could destroy the project it was issued for is a credential worth stealing rather than one worth issuing.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '204 No Content',
        notes: [
          'The cascade is ordered and it matters: documents and assets first, then the dataset rows that name them, then members, tokens and webhooks, and the project row **last** — so an interrupted delete leaves a project that still lists what is left and can be deleted again.',
          'What was removed is logged, because once the rows are gone that line is the only record the delete happened.',
        ],
      },
      {
        id: 'list-datasets',
        method: 'GET',
        path: '/v1/projects/{projectId}/datasets',
        summary: 'A project’s datasets',
        description: 'The content stores inside a project, with their counts and visibility.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `[
  {
    "projectId": "proj_647baf1fe6b1",
    "datasetName": "production",
    "visibility": "PRIVATE",
    "documentCount": 12,
    "assetCount": 4,
    "createdAt": "2026-03-01T09:00:00.000Z",
    "updatedAt": "2026-03-02T10:00:00.000Z",
    "lastMutationAt": "2026-03-02T10:00:00.000Z"
  }
]`,
      },
      {
        id: 'create-dataset',
        method: 'POST',
        path: '/v1/projects/{projectId}/datasets',
        summary: 'Make a dataset',
        description:
          'A content store inside a project. Two datasets are two sets of documents and assets, not one set with a flag — `production` and `staging` are separate rather than the same content twice.',
        auth: 'person',
        parameters: [PROJECT_ID],
        body: [
          { name: 'datasetName', type: 'string', required: true, description: 'Lowercase letters, digits, `_` and `-`. It is also its URL segment, so it is constrained rather than escaped.', example: 'production' },
          { name: 'visibility', type: '"PRIVATE" | "PUBLIC"', description: 'Public means an anonymous reader with a public token may query it. Defaults to private.', example: 'PRIVATE' },
        ],
        responseStatus: '201 Created',
        responseExample: `{ "projectId": "proj_647baf1fe6b1", "datasetName": "production", "visibility": "PRIVATE", "documentCount": 0, "assetCount": 0 }`,
      },
      {
        id: 'get-dataset',
        method: 'GET',
        path: '/v1/projects/{projectId}/datasets/{dataset}',
        summary: 'One dataset',
        description: 'The dataset row: visibility, counts, and when anything last changed in it.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        responseStatus: '200 OK',
        responseExample: `{ "projectId": "proj_647baf1fe6b1", "datasetName": "production", "visibility": "PRIVATE", "documentCount": 12, "assetCount": 4 }`,
      },
      {
        id: 'update-dataset',
        method: 'PATCH',
        path: '/v1/projects/{projectId}/datasets/{dataset}',
        summary: 'Change a dataset’s visibility',
        description: 'The one thing about a dataset that is editable after it exists.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        body: [{ name: 'visibility', type: '"PRIVATE" | "PUBLIC"', required: true, description: 'Who may read it without a token.', example: 'PUBLIC' }],
        responseStatus: '200 OK',
        responseExample: `{ "projectId": "proj_647baf1fe6b1", "datasetName": "production", "visibility": "PUBLIC" }`,
      },
      {
        id: 'delete-dataset',
        method: 'DELETE',
        path: '/v1/projects/{projectId}/datasets/{dataset}',
        summary: 'Delete a dataset and everything in it',
        description: 'Admins only. Documents, then assets, then the row that names them.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        responseStatus: '200 OK',
        responseExample: `{ "documents": 12, "assets": 4, "schemas": 1 }`,
      },
      {
        id: 'export-dataset',
        method: 'GET',
        path: '/v1/projects/{projectId}/datasets/{dataset}/export',
        summary: 'The whole dataset, portable',
        description: 'Schema, documents and asset rows as one object — what a backup is, and what a migration starts from.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        responseStatus: '200 OK',
        responseExample: `{
  "projectId": "proj_647baf1fe6b1",
  "dataset": "production",
  "schema": { "types": [ … ], "revision": "8f2a91…" },
  "documents": [ … ],
  "assets": [ … ],
  "exportedAt": "2026-03-02T10:00:00.000Z"
}`,
      },
      {
        id: 'get-schema',
        method: 'GET',
        path: '/v1/projects/{projectId}/datasets/{dataset}/schema',
        summary: 'The schema a dataset is authored against',
        description:
          'The content types this dataset declares. Everything the studio draws is downstream of this: the list of types, each editor’s controls, the name a list gives a document, and the orderings it offers.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        responseStatus: '200 OK',
        responseExample: `{
  "projectId": "proj_647baf1fe6b1",
  "dataset": "production",
  "types": [
    {
      "name": "pricing",
      "title": "Pricing",
      "kind": "document",
      "icon": "CreditCard",
      "fields": [
        { "name": "title", "title": "Title", "type": "string", "required": true },
        { "name": "plans", "title": "Plans", "type": "array", "of": [ { "name": "item", "type": "object", "fields": [ … ] } ] }
      ]
    }
  ],
  "revision": "8f2a91…",
  "updatedAt": "2026-03-02T10:00:00.000Z"
}`,
        notes: [
          'A dataset with no schema row has **no content types** — an empty list, not somebody else’s model.',
          '`revision` is a hash of the types rather than a timestamp, so two clients that saved the same schema arrive at one revision.',
        ],
      },
      {
        id: 'put-schema',
        method: 'PUT',
        path: '/v1/projects/{projectId}/datasets/{dataset}/schema',
        summary: 'Replace the schema',
        description:
          'The whole list of types, every time. A schema is replaced rather than patched, so a client that saves sends what the schema *is* — which is also why a save can be compared by revision rather than diffed.',
        auth: 'person',
        parameters: [PROJECT_ID, DATASET],
        body: [
          {
            name: 'types',
            type: 'SchemaType[]',
            required: true,
            description: 'Every type the dataset declares, in the order the studio should list them. An empty list is legal: it is the state a new dataset is in.',
            example: '[{"name":"pricing","title":"Pricing","kind":"document","icon":"CreditCard","fields":[{"name":"title","title":"Title","type":"string","required":true}]}]',
          },
        ],
        responseStatus: '200 OK',
        responseExample: `{ "projectId": "proj_647baf1fe6b1", "dataset": "production", "types": [ … ], "revision": "9c1b04…", "updatedAt": "2026-03-02T10:05:00.000Z" }`,
        notes: [
          'Type names have to be identifiers and no two may share one. Anything else — a required field with no title, a reference to a type that does not exist — is somebody’s work in progress, and the studio is where it is argued with.',
          'The studio’s type editor writes this for you: a declaration (`type Pricing = { … }`) or a pasted sample of data.',
        ],
      },
    ],
  },
  {
    id: 'members',
    title: 'Members',
    description:
      'Who is in a project and what they may do. Roles are `ADMIN`, `EDITOR` and `VIEWER`; an invitation is a row keyed by the address it was sent to, and accepting it re-keys that row to the person.',
    endpoints: [
      {
        id: 'list-members',
        method: 'GET',
        path: '/v1/projects/{projectId}/members',
        summary: 'The roster, invitations included',
        description: 'Active members first, then the offers nobody has accepted yet — one list, because that is what it is to somebody reading it.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `[
  { "projectId": "proj_647baf1fe6b1", "userId": "a1b2c3…", "email": "you@example.com", "name": "You", "role": "ADMIN", "status": "ACTIVE", "isYou": true },
  { "projectId": "proj_647baf1fe6b1", "userId": "maya@example.com", "email": "maya@example.com", "role": "EDITOR", "status": "INVITED", "invitedEmail": "maya@example.com", "isYou": false }
]`,
      },
      {
        id: 'invite-member',
        method: 'POST',
        path: '/v1/projects/{projectId}/members',
        summary: 'Invite an address',
        description: 'Admins only. The invitation is the row, and the mail is a notification about it — so an invitation sent to an address that never arrives is still an offer that can be accepted from the studio.',
        auth: 'person',
        parameters: [PROJECT_ID],
        body: [
          { name: 'email', type: 'string', required: true, description: 'Who to invite. Normalized to lowercase.', example: 'maya@example.com' },
          { name: 'role', type: '"ADMIN" | "EDITOR" | "VIEWER"', required: true, description: 'What they may do once they accept.', example: 'EDITOR' },
          { name: 'name', type: 'string', description: 'What to call them until they sign in and say.' },
        ],
        responseStatus: '201 Created',
        responseExample: `{ "userId": "maya@example.com", "email": "maya@example.com", "role": "EDITOR", "status": "INVITED", "invitedEmail": "maya@example.com" }`,
      },
      {
        id: 'update-member',
        method: 'PATCH',
        path: '/v1/projects/{projectId}/members/{userId}',
        summary: 'Change a role',
        description: 'Admins only. The member key is the address while the offer stands and the person’s id once it has been accepted.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'userId', type: 'string', required: true, description: 'The `sub` once accepted, or the address while invited.', example: 'maya@example.com' },
        ],
        body: [{ name: 'role', type: '"ADMIN" | "EDITOR" | "VIEWER"', required: true, description: 'The new role.', example: 'ADMIN' }],
        responseStatus: '200 OK',
        responseExample: `{ "userId": "maya@example.com", "role": "ADMIN", "status": "ACTIVE" }`,
      },
      {
        id: 'remove-member',
        method: 'DELETE',
        path: '/v1/projects/{projectId}/members/{userId}',
        summary: 'Remove a member, or revoke an invitation',
        description: 'One route for both because they are one row and one intent: taking the row away is what stops the person reaching the project, whether or not they ever did.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'userId', type: 'string', required: true, description: 'The `sub` once accepted, or the address while invited.', example: 'maya@example.com' },
        ],
        responseStatus: '204 No Content',
        notes: [
          'The owner is refused. Not because of who may delete the project — every admin may — but because removal is not undoable: the row is keyed by the `sub` once accepted, so there is no address left to invite back to.',
          'The member count moves only when the row removed was an **ACTIVE** membership: losing an invitation nobody accepted must not subtract anybody.',
        ],
      },
      {
        id: 'resend-invitation',
        method: 'POST',
        path: '/v1/projects/{projectId}/members/{userId}/invitation',
        summary: 'Send an invitation again',
        description: 'Refreshes when the offer was made, and moves the role when one is given: re-inviting somebody is also how an admin offers them a different place.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'userId', type: 'string', required: true, description: 'The address the invitation was sent to.', example: 'maya@example.com' },
        ],
        body: [{ name: 'role', type: '"ADMIN" | "EDITOR" | "VIEWER"', description: 'Move them to this role at the same time.', example: 'VIEWER' }],
        responseStatus: '200 OK',
        responseExample: `{ "userId": "maya@example.com", "role": "VIEWER", "status": "INVITED", "invitedAt": "2026-03-02T10:00:00.000Z" }`,
      },
      {
        id: 'accept-invitation',
        method: 'POST',
        path: '/v1/projects/{projectId}/invitation',
        summary: 'Accept your own invitation',
        description:
          'Turns an offer into a membership in one transaction: the invitation is deleted and the membership written under the caller’s `sub`. Half of that pair is worse than neither — an invitation consumed but granting nothing cannot be accepted again.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `{ "userId": "a1b2c3…", "email": "maya@example.com", "role": "EDITOR", "status": "ACTIVE", "joinedAt": "2026-03-02T10:00:00.000Z" }`,
        notes: ['Accepting twice is not an error, and the answer is the membership they already have rather than a second copy of it.'],
      },
      {
        id: 'me',
        method: 'GET',
        path: '/v1/me',
        summary: 'The caller, and their counts',
        description: 'Who the credential is, how many projects they are an active member of, and how many invitations are waiting. A person’s profile row is written the first time this is asked.',
        auth: 'person',
        responseStatus: '200 OK',
        responseExample: `{
  "userId": "a1b2c3…",
  "email": "you@example.com",
  "name": "You",
  "createdAt": "2026-02-01T09:00:00.000Z",
  "projectCount": 2,
  "invitationCount": 1
}`,
      },
      {
        id: 'my-invitations',
        method: 'GET',
        path: '/v1/me/invitations',
        summary: 'Offers addressed to you',
        description: 'Invitations for the caller’s own verified address, wherever they were sent from. Queried through the address index, so it cannot return an offer addressed to somebody else.',
        auth: 'person',
        responseStatus: '200 OK',
        responseExample: `[
  { "projectId": "proj_647baf1fe6b1", "projectName": "Mandarino", "role": "EDITOR", "invitedBy": "a1b2c3…", "invitedAt": "2026-03-01T09:00:00.000Z" }
]`,
      },
    ],
  },
  {
    id: 'tokens',
    title: 'Tokens',
    description:
      'The credential the rest of this page is about. A token is the project’s own — issued by an admin, scoped to a role and optionally to one dataset, and revocable on its own, so it keeps working when the person who issued it leaves.',
    endpoints: [
      {
        id: 'list-tokens',
        method: 'GET',
        path: '/v1/projects/{projectId}/tokens',
        summary: 'The project’s tokens',
        description: 'Admins only. What each token is called, what it may do, and when it was last used — never the secret, which is answered once and stored only as a hash.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `[
  { "tokenId": "01JQ8Z…", "name": "Build server", "role": "VIEWER", "dataset": null, "createdAt": "2026-03-01T09:00:00.000Z", "lastUsedAt": "2026-03-02T10:00:00.000Z", "revokedAt": null }
]`,
      },
      {
        id: 'create-token',
        method: 'POST',
        path: '/v1/projects/{projectId}/tokens',
        summary: 'Issue a token',
        description:
          '**The only response that carries the secret.** Admins only. What comes back is `achar_<tokenId>_<secret>`; the server keeps a hash, so a lost secret is reissued rather than recovered.',
        auth: 'person',
        parameters: [PROJECT_ID],
        body: [
          { name: 'name', type: 'string', required: true, description: 'What it is for. A name nobody can place is a token nobody revokes.', example: 'Build server' },
          { name: 'role', type: '"ADMIN" | "EDITOR" | "VIEWER"', required: true, description: 'What it may do. A token is checked against the role the same way a member is.', example: 'VIEWER' },
          { name: 'dataset', type: 'string', description: 'Scope it to one dataset. Absent means the whole project.', example: 'production' },
        ],
        responseStatus: '201 Created',
        responseExample: `{
  "tokenId": "01JQ8Z…",
  "name": "Build server",
  "role": "VIEWER",
  "token": "achar_01JQ8Z…_9f2c41…",
  "createdAt": "2026-03-02T10:00:00.000Z"
}`,
        notes: [
          'The secret is shown once. `GET /v1/projects/{projectId}/tokens` will never answer with it again.',
          'A token is a **kind** of credential as well as a rank: it can never create or delete a project, whatever role it holds.',
        ],
      },
      {
        id: 'revoke-token',
        method: 'DELETE',
        path: '/v1/projects/{projectId}/tokens/{tokenId}',
        summary: 'Revoke a token',
        description: 'The row is marked revoked rather than removed, so “who had this and when” survives it. Revoking twice is not an error.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'tokenId', type: 'string', required: true, description: 'The token, by the id in its secret.', example: '01JQ8Z…' },
        ],
        responseStatus: '204 No Content',
      },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    description:
      'What a project tells the outside world. A publish, a create, an update and a delete each queue a delivery, which is attempted, retried and recorded rather than fired and forgotten.',
    endpoints: [
      {
        id: 'list-webhooks',
        method: 'GET',
        path: '/v1/projects/{projectId}/webhooks',
        summary: 'The project’s webhooks',
        description: 'What is subscribed, to which events, and whether it is in service.',
        auth: 'person',
        parameters: [PROJECT_ID],
        responseStatus: '200 OK',
        responseExample: `[
  { "webhookId": "01JQ8Z…", "url": "https://example.com/hooks/achar", "events": ["publish"], "dataset": "production", "active": true, "createdAt": "2026-03-01T09:00:00.000Z" }
]`,
      },
      {
        id: 'create-webhook',
        method: 'POST',
        path: '/v1/projects/{projectId}/webhooks',
        summary: 'Make a webhook',
        description: 'A URL, the events it wants, and optionally a dataset and a filter so that a receiver is told what it subscribes to rather than everything.',
        auth: 'person',
        parameters: [PROJECT_ID],
        body: [
          { name: 'url', type: 'string', required: true, description: 'Where deliveries are POSTed.', example: 'https://example.com/hooks/achar' },
          { name: 'events', type: 'WebhookEvent[]', required: true, description: 'One or more of `create`, `update`, `delete`, `publish`.', example: '["publish"]' },
          { name: 'dataset', type: 'string', description: 'Only deliveries from this dataset.' },
          { name: 'filter', type: 'string', description: 'A GROQ filter the document has to match.' },
          { name: 'projection', type: 'string', description: 'A GROQ projection, so the receiver is sent the fields it needs and not the whole document.' },
        ],
        responseStatus: '201 Created',
        responseExample: `{ "webhookId": "01JQ8Z…", "url": "https://example.com/hooks/achar", "events": ["publish"], "active": true }`,
      },
      {
        id: 'update-webhook',
        method: 'PATCH',
        path: '/v1/projects/{projectId}/webhooks/{webhookId}',
        summary: 'Change a webhook, or take it out of service',
        description: 'The URL, the events, the filter, or `active` — a webhook that is failing is usually paused rather than deleted, because the deliveries it already recorded are worth keeping.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'webhookId', type: 'string', required: true, description: 'The webhook.', example: '01JQ8Z…' },
        ],
        body: [
          { name: 'url', type: 'string', description: 'A new address.' },
          { name: 'events', type: 'WebhookEvent[]', description: 'A new set of events.' },
          { name: 'filter', type: 'string', description: 'A new filter.' },
          { name: 'projection', type: 'string', description: 'A new projection.' },
          { name: 'active', type: 'boolean', description: 'False pauses deliveries without forgetting the webhook.' },
        ],
        responseStatus: '200 OK',
        responseExample: `{ "webhookId": "01JQ8Z…", "url": "https://example.com/hooks/achar", "events": ["publish"], "active": false }`,
      },
      {
        id: 'delete-webhook',
        method: 'DELETE',
        path: '/v1/projects/{projectId}/webhooks/{webhookId}',
        summary: 'Delete a webhook',
        description: 'The webhook and its deliveries. A delivery’s own record is what a receiver is judged by, so it goes with the subscription it belongs to.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'webhookId', type: 'string', required: true, description: 'The webhook.', example: '01JQ8Z…' },
        ],
        responseStatus: '204 No Content',
      },
      {
        id: 'list-deliveries',
        method: 'GET',
        path: '/v1/projects/{projectId}/webhooks/{webhookId}/deliveries',
        summary: 'What a webhook has been told',
        description: 'One attempt each: the event, the document, what the receiver answered, and when it will be tried again.',
        auth: 'person',
        parameters: [
          PROJECT_ID,
          { in: 'path', name: 'webhookId', type: 'string', required: true, description: 'The webhook.', example: '01JQ8Z…' },
          LIMIT,
          NEXT_TOKEN,
        ],
        responseStatus: '200 OK',
        responseExample: `{
  "items": [
    { "deliveryId": "01JQ8Z…", "event": "publish", "documentId": "pricing", "status": 200, "attempts": 1, "deliveredAt": "2026-03-02T10:00:00.000Z" }
  ],
  "nextToken": null
}`,
        notes: ['A delivery is remembered for fourteen days and then pruned, which is what the TTL on the row is for.'],
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
];
