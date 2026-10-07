# DO NOT

- Take screenshots to test your changes. It wastes tokens.
- Commit. That is the user's job.
- Write throwaway scripts, and especially do not add new ones under `infra/scripts/`
  or wire them into builds. A script that exists only because a change was awkward
  to make by hand is a second build to keep working, and it hides the awkwardness
  instead of solving it. If a change seems to need one, stop and say so: either the
  design should be simpler, or the step belongs in a deploy or in an existing
  script — ask before inventing anything.
- Use arbitrary Tailwind values like `text-[15px]`. If a size is not a token, it is
  not a size.

## Deploying

- **Do not deploy.** Not unless explicitly told to. That is the user's job.
- The infrastructure is the CDK app in `infra/`, not `services/api`: a handler
  lives in `services/api/src/functions/**` and its route in
  `infra/src/generated/service.ts`. Read [infra/README.md](infra/README.md) before
  changing either.
- `infra/src/generated/service.ts` is the backend as data. It was generated once
  and is **edited by hand** from here. Add a route by adding a `FunctionSpec` to it
  and a file at its `entry` — nothing else maps a function to a file.

## Where things live

```
apps/
  web/        the public site — renders Achar's own content, with a seed fallback
  studio/     the content studio — schema-driven authoring, drafts and publishing
  console/    the control room — deploys the backend, starts the frontends, reads AWS
  demo/       a third-party client of the content API, and nothing else
services/api  the Lambda handlers, and the library they are written against
infra/        the CDK app: five stacks, the service table, the bundler
packages/     types, schema, api, auth, ui — all source, no builds
```

Read [docs/architecture.md](docs/architecture.md) before adding a screen or moving
code: it says what belongs in a package, how the aliases resolve, and why the
console deliberately shares no code with the apps it deploys.

`apps/demo` is a third-party OAuth-style client of the content API rather than a
fourth surface of the product, and it may import **only** `@achar/api` and
`@achar/types` — the day it imports `@achar/ui` or `@achar/auth` it stops being a
demonstration of what an outsider can build.

## The CDK app is TypeScript that node runs

`cdk.json` says `"app": "node bin/achar.ts"`. Node 26 strips types natively, so
there is no `ts-node` and no build step before `synth`. Three constraints follow
from that, and they are not preferences:

- **Relative imports carry the `.ts` extension.** Node resolves files, not module
  specifiers. `tsconfig.json` sets `allowImportingTsExtensions` to match.
- **Type-only imports must say `import type`.** A plain `import` of a type survives
  into the JavaScript and fails at load.
- **No `enum`, `namespace`, or constructor parameter properties.** They are not
  erasable. Union types and `const` objects stand in.

## Typechecking

Every workspace, from the repository root:

```bash
npm run typecheck                        # all of them
./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json   # just one
```

The packages are source rather than builds, so an app's typecheck covers the
shared code it draws on: a change to a shared component is checked by the apps that
use it, not only by the package it lives in.
