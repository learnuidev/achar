# Achar

**Achar is a content operating system** — a structured-content platform: a content
lake, a query language, a schema-driven studio for authoring against it, and the
sites that read it back.

This repository holds all of it, plus the console that deploys and operates the
AWS backend underneath. It is a working clone of [sanity.io](https://www.sanity.io/)
— the same product shape, the same four surfaces, the same split between content
and the API that serves it — built on Next.js, AWS CDK and DynamoDB.

```
apps/
  web/        the public site — the marketing front door, and the content it renders
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
  auth/       Cognito sign-in, and the hooks an app reads a viewer through
  ui/         the design system the apps and the console draw with
```

## The idea in one screen

Content lives as **documents** — an array of objects with a type, not a row with
columns. A project owns datasets; a dataset owns documents and assets; a **schema**
says what a document of each type may contain.

```ts
// A document, as the API returns it
{ _id: 'post-1', _type: 'post', _rev: '01J…', title: 'What a content lake is', … }

// The same content, asked for in GROQ
*[_type == "post" && publishedAt < now()] | order(publishedAt desc) [0...10] {
  title,
  "slug": slug.current,
  "author": author->name
}
```

Two splits carry the whole design, and both are visible from the outside:

- **A document is a draft or it is published, and the pair is the point.** The
  draft is the row whose id begins `drafts.`; the published one is the row. They
  are *two rows*, not one row with a flag — which is what lets a draft be edited
  for a week while the site keeps serving what was published.
- **Reading is wider than writing.** A `VIEWER` reads; an `EDITOR` writes
  documents, assets and the schema; an `ADMIN` also manages who is in the room. A
  learner of the public API with a token gets exactly the dataset and role the
  token names.

## Quick start

```bash
npm install
```

The three apps, each on its own port:

```bash
npm run dev:app        # http://localhost:3000  the site, and /studio for the studio
npm run console        # http://localhost:3002  the control room
npm run dev:demo       # http://localhost:3003  a third-party client
```

The site and the studio are one app with two surfaces: `/` is the marketing front
door, `/studio` is where the content it renders is authored. They share a build, a
set of environment variables and an origin, and they share no chrome — the site's
header and footer stop at the studio, and the studio's sign-in gate stops at the
site.

**The public site runs with no backend at all.** `apps/app` renders Achar's own
content from `seedDocuments()` in `@achar/schema` when no API is configured, and
switches to live content the moment `NEXT_PUBLIC_ACHAR_API_URL` points at one. That
is deliberate: a marketing site that cannot be looked at without a deployed
database is a marketing site nobody works on.

The studio and the demo need an API and a sign-in. When they have neither they say
so, and point at the console — which is what writes `apps/*/.env.local` for a
chosen environment.

## Deploying it

Everything AWS is one CDK app with five stacks. You do not drive it by hand:

```bash
npm run console        # → Backends → an environment → Deploy
```

The console walks a checklist of **eleven steps**, and each step is a *check* and
an *apply* — the check asks "is this already true?", and when it is, the step is a
check mark with the reason beside it and nothing runs. So a second press of the
button is cheap, and the transcript says why every step was skipped or what it
did. [docs/architecture.md](docs/architecture.md) has the whole design;
[infra/README.md](infra/README.md) has the stacks.

By hand, if you want to see the raw output:

```bash
npm run synth                     # what would be deployed
npm run deploy:dev                # all five stacks, stage dev
```

Nothing here deploys itself. There is no timer, no watcher, and no post-install
hook.

## Where to read next

| | |
| --- | --- |
| [docs/architecture.md](docs/architecture.md) | The whole design: the packages, the API, the tables, the stacks, the console |
| [infra/README.md](infra/README.md) | The five stacks, `ownership`, the service table, the bundler |
| [infra/config/README.md](infra/config/README.md) | What an environment's config file is, and what is deliberately not in it |
| `packages/types/src/index.ts` | The domain contract — the answer to "what is a document here" |
| `services/api/src/lib/groq/index.ts` | The query language, and the exact grammar that is implemented |
| `apps/console/README.md` | The control room, and what it will not do |

## Conventions

- **Comments explain why, never what.** The code already says what. A non-obvious
  decision, a rejected alternative, or a reason a thing is shaped oddly earns a
  comment; a `for` loop does not.
- **No arbitrary Tailwind values.** `text-[15px]` is a size nobody can find again.
  If a size is not a token, it is not a size.
- **The packages are source, not builds.** `@achar/*` ships `.ts`/`.tsx` and no
  `dist/`, so one TypeScript program spans an app and its packages and a change to
  a shared component is checked by the apps that use it.
- **The console imports no `@achar/*` package**, on purpose: a tool that shares a
  component with the thing it deploys cannot be used to diagnose that thing.

## Toolchain

Everything is at the current release: Next 16, React 19, TypeScript 7, Tailwind 4,
AWS CDK 2.272, AWS SDK v3, esbuild 0.28.

The CDK app is TypeScript that `node` runs directly — Node strips types natively,
so there is no `ts-node` and no build step before `synth`. That imposes three real
constraints, all documented in [infra/README.md](infra/README.md): relative imports
carry the `.ts` extension, type-only imports must say `import type`, and `enum` is
not available.
