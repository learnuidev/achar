# Achar — architecture

Achar is a structured-content system: a content lake, a query language, a studio
that authors against a schema, and the sites that read it. This repository holds
all of it, plus the console that deploys and operates the AWS backend underneath.

The repository shape is deliberately the same as `play`'s: **apps on one backend,
sharing packages, deployed by one CDK app, driven by one console.**

```
apps/
  web/        the public site — the marketing front door and the content it renders
  studio/     the content studio — schemas, documents, assets, publishing
  console/    the control room — deploys the backend, starts the frontends, reads AWS
  demo/       a third-party client of the content API, and nothing else
services/
  api/        the Lambda handlers, and the shared library they are written against
infra/        the AWS CDK app: five stacks, the route table, the bundler
packages/
  types/      the domain contract — every other workspace depends on this one
  schema/     the schema DSL, validation, and Achar's own content model
  api/        the typed client over the content API
  auth/       Cognito sign-in, and the hooks the apps read a viewer through
  ui/         the design system both apps and the console draw with
```

## Ports

| App | Port | What it is |
| --- | --- | --- |
| `apps/web` | 3000 | The public site |
| `apps/studio` | 3001 | The studio |
| `apps/console` | 3002 | The console |
| `apps/demo` | 3003 | The third-party client |

## Dependencies — all at latest

| Package | Version |
| --- | --- |
| `next` | `^16.4.0` |
| `react` / `react-dom` | `^19.3.0` |
| `typescript` | `^7.0.2` |
| `tailwindcss` / `@tailwindcss/postcss` | `^4.3.3` |
| `lucide-react` | `^1.52.0` |
| `clsx` / `tailwind-merge` / `class-variance-authority` | `^2.1.1` / `^3.7.0` / `^0.7.1` |
| `next-themes` / `sonner` / `tw-animate-css` | `^0.4.6` / `^2.0.8` / `^1.4.0` |
| `@radix-ui/react-*` | latest per package |
| `aws-cdk-lib` / `constructs` / `aws-cdk` | `^2.272.0` / `^10.8.1` / `^2.1144.0` |
| `esbuild` | `^0.28.2` |
| `@aws-sdk/*` | `^3.1147.0` |
| `@types/node` | `^26.6.4` |

**Next 16 is async-params.** Every dynamic route's `params` and `searchParams` is
a `Promise` and must be awaited, in pages *and* in route handlers. `cookies()` and
`headers()` are async too.

**The packages are source, not builds.** `@achar/*` ships `.ts`/`.tsx` and no
`dist/`. Every app lists them in `transpilePackages` and maps them in
`tsconfig.json` `paths`. One TypeScript program spans an app and its packages, so
a change to a shared component is a change that app's `typecheck` sees.

## The packages

### `@achar/types`

The contract. Types, and the few `readonly` arrays that go with them
(`PROJECT_ROLES`, `PERSPECTIVES`, `WEBHOOK_EVENTS`). No logic, no imports. Read
`packages/types/src/index.ts` — it is the answer to "what is a document here".

### `@achar/schema`

The schema DSL, and Achar's own content model.

```ts
import { defineType, defineField, defaultSchema, validateDocument, previewOf, initialDocument } from '@achar/schema';

defineType({ name: 'post', title: 'Post', kind: 'document', fields: [ defineField({ name: 'title', title: 'Title', type: 'string', required: true }) ] });
```

- `defineType(type): SchemaType`, `defineField(field): SchemaField` — identity
  functions with defaults applied, so a schema reads the same wherever it is
  written.
- `defaultSchema(): DatasetSchema` — **the content model the public site is
  rendered from.** Every type listed below. The seed writes it, the studio edits
  it, `apps/web` reads it, and `apps/demo` queries it.
- `validateDocument(type: SchemaType, value: unknown): SchemaIssue[]` where
  `SchemaIssue = { path: string; message: string }`.
- `initialDocument(type: SchemaType): Record<string, unknown>` — a new document
  with every `initialValue` applied and every required string an empty string.
- `previewOf(type: SchemaType, document): { title: string; subtitle?: string; mediaField?: string }`.
- `slugify(input: string): string`.
- `documentTypes(schema): SchemaType[]` and `fieldByPath(type, path)`.

**Achar's own content model** — `defaultSchema()` returns exactly these:

| Type | Kind | Fields that matter |
| --- | --- | --- |
| `siteSettings` | document | `title`, `description`, `tagline`, `primaryCta{label,href}`, `secondaryCta{label,href}`, `announcement` |
| `post` | document | `title`, `slug`, `excerpt`, `coverImage` (image), `publishedAt` (datetime), `author` (reference→author), `categories` (array→reference category), `body` (portableText), `featured` (boolean) |
| `author` | document | `name`, `role`, `avatar` (image), `bio` (text), `links` (array of object `{label, href}`) |
| `category` | document | `title`, `slug`, `description` |
| `page` | document | `title`, `slug`, `body` (portableText) |
| `customer` | document | `name`, `logo` (image), `industry`, `quote` (text), `quoteAuthor`, `metrics` (array of object `{label, value}`), `order` (number) |
| `feature` | document | `title`, `description`, `icon` (string), `group` (string: `content`\|`platform`\|`ai`), `order` (number) |
| `pricingPlan` | document | `name`, `price` (string), `period`, `description`, `features` (array of string), `ctaLabel`, `ctaHref`, `highlighted` (boolean), `order` |
| `faq` | document | `question`, `answer` (text), `order` |
| `integration` | document | `name`, `description`, `category`, `logo` (image), `order` |

Each carries `preview` and `orderings` where they help a list.

### `@achar/api`

The typed client. Every method returns the shape `@achar/types` declares.

```ts
const client = new AcharClient({ apiUrl, token });
await client.query<Post[]>('production', { query: '*[_type == "post"] | order(publishedAt desc)' });
```

- `new AcharClient({ apiUrl: string; token?: string | null })`
- `AcharApiError` — carries `status` and the parsed `ApiErrorBody`.
- `uploadAsset(client, projectId, dataset, file: File, onProgress?)` — reserves the
  row, PUTs the bytes to S3, commits the metadata. Returns `Asset`.
- `imageUrl(asset, { width, height, quality })` — a CDN URL with transform params.
- Methods, all of them: `info`, `me`, `myInvitations`, `listProjects`,
  `createProject`, `getProject`, `updateProject`, `deleteProject`, `listMembers`,
  `inviteMember`, `updateMemberRole`, `removeMember`, `resendInvitation`,
  `acceptInvitation`, `listDatasets`, `createDataset`, `getDataset`,
  `deleteDataset`, `getSchema`, `putSchema`, `query`, `listDocuments`,
  `getDocument`, `mutate`, `publishDocument`, `unpublishDocument`,
  `discardDraft`, `listAssets`, `createUploadTicket`, `commitAsset`, `deleteAsset`,
  `listTokens`, `createToken`, `revokeToken`, `listWebhooks`, `createWebhook`,
  `updateWebhook`, `deleteWebhook`, `listDeliveries`, `exportDataset`.

### `@achar/auth`

Cognito, through Amplify — the same arrangement `play` uses, for the same reason:
sign-in is the one thing an app should not be inventing.

- `configureAuth(config: AcharAuthConfig)` where
  `AcharAuthConfig = { region, userPoolId, userPoolWebClientId, domain, apiUrl, redirectSignIn, redirectSignOut }`,
  read from `NEXT_PUBLIC_*` by `authConfigFromEnv()`.
- `<AuthProvider>`, `useViewer(): { viewer, loading, signedIn, signOut, getToken }`,
  `useSignedIn()`.
- `<SignIn />`, `<OAuthCallback />` — Google, and email/password.
- `getAccessToken(): Promise<string | null>`.

### `@achar/ui`

The design system. Exports:

`cn`, `Button`, `Card`, `CardHeader`, `CardTitle`, `CardDescription`,
`CardContent`, `CardFooter`, `Badge`, `Input`, `Textarea`, `Label`, `Separator`,
`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, `Dialog`, `DialogTrigger`,
`DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`,
`DialogFooter`, `DropdownMenu` (+ its parts), `Tooltip` (+ parts), `Skeleton`,
`Switch`, `Select` (+ parts), `Toaster`, `AcharMark`, `ThemeToggle`, `Reveal`.

Tailwind v4, CSS-variable tokens, light and dark. **No arbitrary values** like
`text-[15px]` — if a size is not a token, it is not a size.

## The content API

Everything is under `/v1`. Every route needs a bearer token — either a Cognito ID
token or one of the API tokens the studio issues — **except `GET /v1/info`**,
which exists precisely so a deployment can be asked whether it is up.

### Two credentials, and where each one is checked

Achar accepts two kinds of caller, and the split between them decides where
authentication happens:

| Caller | Credential | Called by |
| --- | --- | --- |
| A signed-in person | Cognito **ID token** | The studio and the console |
| A machine | An **API token**, `achar_<tokenId>_<secret>` | The site, the demo app, scripts, CI |

The routes split to match, because **API Gateway's JWT authorizer only understands
Cognito tokens** — an API token presented to a JWT-authorised route is refused at
the gateway, before any handler runs, so a token path in the handler would be dead
code.

| Routes | Authorizer | Who verifies |
| --- | --- | --- |
| `/v1/projects/**`, `/v1/me` | Cognito JWT, at the gateway | API Gateway |
| `/v1/data/**`, `/v1/assets/**` | none | **the handler**, via `resolveViewer` |
| `/v1/info` | none | nobody — it is the one anonymous route |

`resolveViewer` is the single entry point that decides which credential it was
given. On a gateway-authorised route it reads the claims API Gateway already
verified — re-verifying them would be work for nothing. On a content route there
are no claims, so it verifies an API token by hash comparison, or a Cognito ID
token by RS256 signature against the pool's JWKS (cached in module scope, since a
fetch per request would put a network round trip on every content read).

**The consequence to remember:** a content route has no gateway authorizer, so
**its handler is the only thing between the dataset and an anonymous caller**.
Every one of those routes refuses an anonymous request itself, with the same
`ApiErrorBody` 401 envelope.

Management routes stay on the gateway authorizer because they are only ever called
by a person who is already signed in, and doing the verification at the edge means
the handler never sees an unauthenticated request at all.

`{p}` is a project id, `{d}` a dataset name.

| Method | Path | Who | What it does |
| --- | --- | --- | --- |
| GET | `/v1/info` | anyone | Service name, version, stage, region |
| GET | `/v1/me` | any caller | The caller and their counts |
| GET | `/v1/me/invitations` | any caller | Offers addressed to the caller's own address |
| POST | `/v1/projects` | any caller | Create a project; the caller becomes its admin |
| GET | `/v1/projects` | any caller | The caller's projects |
| GET | `/v1/projects/{p}` | members | One project, with the caller's role |
| PATCH | `/v1/projects/{p}` | admins | Rename, or rewrite the description |
| DELETE | `/v1/projects/{p}` | owner | Delete it, its datasets, its documents, its assets |
| GET | `/v1/projects/{p}/members` | members | The roster, invitations included |
| POST | `/v1/projects/{p}/members` | admins | Invite an address with a role |
| PATCH | `/v1/projects/{p}/members/{userId}` | admins | Change a role |
| DELETE | `/v1/projects/{p}/members/{userId}` | admins | Remove a member, or revoke an invitation |
| POST | `/v1/projects/{p}/members/{userId}/invitation` | admins | Send an invitation again |
| POST | `/v1/projects/{p}/invitation` | invited | Accept the caller's own invitation |
| GET | `/v1/projects/{p}/datasets` | members | The project's datasets |
| POST | `/v1/projects/{p}/datasets` | editors | Make a dataset |
| GET | `/v1/projects/{p}/datasets/{d}` | members | One dataset |
| PATCH | `/v1/projects/{p}/datasets/{d}` | editors | Change its visibility |
| DELETE | `/v1/projects/{p}/datasets/{d}` | admins | Delete it and everything in it |
| GET | `/v1/projects/{p}/datasets/{d}/export` | members | The whole dataset, portable |
| GET | `/v1/projects/{p}/datasets/{d}/schema` | members | The schema it is authored against |
| PUT | `/v1/projects/{p}/datasets/{d}/schema` | editors | Replace it |
| GET | `/v1/projects/{p}/tokens` | admins | The project's API tokens |
| POST | `/v1/projects/{p}/tokens` | admins | Issue one — **the only response that carries the secret** |
| DELETE | `/v1/projects/{p}/tokens/{tokenId}` | admins | Revoke it |
| GET | `/v1/projects/{p}/webhooks` | members | The project's webhooks |
| POST | `/v1/projects/{p}/webhooks` | editors | Make one |
| PATCH | `/v1/projects/{p}/webhooks/{webhookId}` | editors | Change it, or take it out of service |
| DELETE | `/v1/projects/{p}/webhooks/{webhookId}` | editors | Delete it |
| GET | `/v1/projects/{p}/webhooks/{webhookId}/deliveries` | members | What it has been told, and what happened |
| GET | `/v1/data/query/{p}/{d}` | readers | **GROQ.** `?query=&params=&perspective=` |
| GET | `/v1/data/list/{p}/{d}` | readers | Documents of one type, paged, for a studio's list |
| GET | `/v1/data/doc/{p}/{d}/{docId}` | readers | One document, at one perspective |
| POST | `/v1/data/mutate/{p}/{d}` | editors | Apply an ordered batch of mutations |
| GET | `/v1/assets/{p}/{d}` | readers | The asset library |
| POST | `/v1/assets/{p}/{d}/upload-url` | editors | Reserve a row and presign a PUT |
| POST | `/v1/assets/{p}/{d}` | editors | Commit the metadata after the PUT |
| DELETE | `/v1/assets/{p}/{d}/{assetId}` | editors | Delete the object and the row |

### GROQ

`services/api/src/lib/groq/` implements the subset that matters, and **says so in
its own README comment**: `*` and `*[_type == "x"]`, `&&`, `||`, `!`, `==`, `!=`,
`<`, `>`, `<=`, `>=`, `in`, `match`, `defined()`, `count()`, `order()`, `[n...m]`,
`[0]`, `{ projection }`, `->` dereference, `^` parent, `$param`, and the pipe
operator. Anything outside it is a 400 naming the position, not a silent empty
result.

## The AWS backend

Five stacks, split by **what a change to one of them costs**, exactly as `play`
splits its own:

| Stack | Holds | Deploy frequency |
| --- | --- | --- |
| `AcharDataStack` | The DynamoDB tables | Rarely |
| `AcharMediaStack` | The assets bucket, the CloudFront content CDN, the log bucket | Rarely |
| `AcharAuthStack` | The Cognito user pool, its app client, its Hosted UI domain | Occasionally |
| `AcharWebhookStack` | The publish-webhook delivery function and its queue | Occasionally |
| `AcharApiStack` | The handlers, their routes, and the IAM | Constantly |

`ownership` in `infra/config/achar-<stage>.json` decides, per group
(`tables` / `media` / `auth`), whether a stack **creates** the resource or
**imports** it by physical name. A new environment sets all three `true` and
imports nothing. An imported resource is unmanaged: a deploy will not change it
and will not delete it.

The stage is a context value, so one app describes every deployment:

```bash
cdk deploy --all --context stage=dev
```

### The tables

| Table | Keys | Purpose |
| --- | --- | --- |
| `ProjectsTable` | `projectId` | name, slug, owner, counts, timestamps |
| `MembersTable` | `projectId` + `memberKey` | role, status, email, invitedEmail; GSIs `UserProjectIndex`, `InviteEmailIndex` |
| `DatasetsTable` | `projectId` + `datasetName` | visibility, counts |
| `SchemasTable` | `projectId` + `datasetKey` | the schema, and its revision |
| `DocumentsTable` | `documentKey` (`{projectId}#{dataset}#{id}`) | the document; GSIs `TypeIndex` (`typeKey` + `_updatedAt`), `UpdatedIndex` (`datasetKey` + `_updatedAt`) |
| `AssetsTable` | `projectId` + `assetKey` | metadata; GSI `DatasetCreatedIndex` |
| `TokensTable` | `tokenId` | hashed secret, role, dataset; GSI `ProjectIndex` |
| `WebhooksTable` | `projectId` + `webhookId` | url, events, filter, projection |
| `DeliveriesTable` | `webhookId` + `deliveryId` | one attempt each; TTL |
| `ProfilesTable` | `userId` | the person, and when they joined |

`DocumentsTable` is the one worth reading twice: `documentKey` is
`{projectId}#{dataset}#{documentId}`, so a dataset's content is one `begins_with`
query, and the draft is simply the row whose id begins `drafts.` — the pair the
whole draft/publish model rests on.

### The route table

`infra/src/generated/service.ts` is the backend as data: `SERVICE_DEFAULTS`,
`TABLES` (physical shape **and** the IAM each needs), and `FUNCTIONS` (a key, an
entry point relative to `services/api`, and the HTTP routes that reach it). The
stacks read it and turn it into CloudFormation; `infra/src/bundling.ts` turns each
`entry` into the Lambda asset and the handler string.

**It is generated once and then edited by hand** — the same standing `play`'s is
in. Adding a route means adding a `FunctionSpec` and a file under
`services/api/src/functions/`.

### HTTP API

API Gateway **HTTP API** (v2), one Lambda integration per function, and a Cognito
JWT authorizer on the management routes only — the content routes authenticate
themselves, for the reason given under *Two credentials* above. CORS allows the
app origins.

**The handlers set `Access-Control-Allow-Origin` themselves**, in the one function
every response passes through, because an HTTP API applies its CORS configuration
to *preflight* requests only. A REST API adds the headers to the actual response
too, through `GatewayResponses`, and that is the one thing the older product does
better; the API Gateway preflight is still used, because a preflight that reached
a Lambda would be an invocation for a request no user made.

## The console

`apps/console` is the control room, and the direct counterpart of `play`'s. It has
the same five surfaces:

| Page | What it is |
| --- | --- |
| `/backends` | Every environment, what state it is in, and one button each |
| `/backends/{stage}` | Tabs: Checklist, Env, Deployments, Logs, Tables |
| `/frontends` | The four apps, whether each is running, and where |
| `/frontends/{app}` | Env variables for one app against one stage, and its logs |
| `/integrations/aws` | Who the CLI is, which account, and what is in it |

Its server side is `src/server/`, and its API is `src/app/api/`, both arranged the
way `play` arranges its own:

```
src/server/
  repo.ts          the repository root, the apps, the profile, the binaries
  exec.ts          running a process and turning its output into lines
  aws.ts           the AWS CLI as a function or two — every call is a read
  environments.ts  infra/config/achar-<stage>.json, and the outputs an app needs
  settings.ts      what a person supplies: the config file and the credentials
  plan.ts          THE BACKEND PLANS: the steps a deploy walks, and a delete walks
  run.ts           the run engine — steps, transcript, cancel, result
  run-api.ts       one step's transcript after the fact, and the live stream
  services.ts      the four dev servers, and cleaning up after them
  tables.ts        the environment's DynamoDB tables, and a page of one's rows
  metrics.ts       CloudWatch's numbers for one function, with quiet slots filled
```

**The console deploys nothing by itself.** There is no timer and no watcher. The
plan runs when the button is pressed. Every read is a `describe`, a `list` or a
`get-parameters`; the only writes are behind buttons, and none of them is a deploy.

## Conventions

- **No throwaway scripts.** A script that exists only because a change was awkward
  to make by hand is a second build to keep working, and it hides the awkwardness
  instead of solving it. If a change seems to need one, say so.
- **No arbitrary Tailwind values** — `text-[15px]` is a size nobody can find again.
- **A comment says why, not what.** The code already says what.
- **Handlers are one export per file**, `export const handler`, and the entry path
  in the route table is the file's path.
- **Every handler answers errors as `ApiErrorBody`.** A 500 with a stack trace in
  it is a 500 somebody has to read CloudWatch to understand.
