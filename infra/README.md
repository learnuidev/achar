# `infra` — the AWS CDK app

One CDK app describes every environment. The stage is a context value, so there is
no per-stage code:

```bash
cd infra
npx cdk synth --all --context stage=dev      # what would be deployed
npx cdk diff  --all --context stage=dev
npx cdk deploy --all --context stage=dev
```

Or from the repository root, which is what the console runs:

```bash
npm run synth
npm run deploy:dev
```

**You do not normally run these by hand.** `npm run console` is the control room:
it walks a checklist of eleven steps, checks each one before running it, streams
the transcript, and writes the config file an environment needs. `cdk` directly is
for the times when something is broken and you want to see the raw output.

## The five stacks

They are split by **what a change to one of them costs**, not by size.

| Stack | Holds | Deploy frequency |
| --- | --- | --- |
| `AcharDataStack` | The ten DynamoDB tables | Rarely |
| `AcharMediaStack` | The assets bucket and the CloudFront CDN | Rarely |
| `AcharAuthStack` | The user pool, its app client, the Hosted UI domain | Occasionally |
| `AcharWebhookStack` | The delivery queue, and the function that empties it | Occasionally |
| `AcharApiStack` | 38 functions, their routes, and the IAM | Constantly |

CloudFormation caps a stack at 500 resources and this API is large enough for that
to be a real number: 38 functions, each with a log group and an integration, plus
ten tables with fourteen indexes between them. The split is what assigns that
ceiling — adding a route touches one stack, and that stack has room.

## `ownership` — created, or imported

The first three stacks each hold one stateful group, and
`ownership` in `infra/config/achar-<stage>.json` decides per group whether the
stack **creates** it or **imports** it by physical name.

- **A new environment** sets all three `true`. It creates its own tables, bucket,
  distribution and pool, named `achar-<stage>-*` and empty. This is what the
  console writes, and it is what almost every environment is.
- **A stage that already existed** sets all three `false`. Every resource is
  imported and therefore *unmanaged*: CloudFormation will not change it and will
  not delete it. `cdk deploy --all` is then close to a no-op for everything but
  `AcharApiStack`, and if it is not, something is wrong.

`false` exists for one reason: those resources hold the product. A stage that
copies it inherits somebody else's data rather than getting its own.

`npm run import-state --workspace achar-infra -- --stage=dev --write` reads an
existing deployment's names out of CloudFormation and writes that config. It reads
only, and it writes `ownership` as all-`false`, because adopting resources is
exactly what import means.

## The service table

`src/generated/service.ts` is the backend as data — `SERVICE_DEFAULTS`,
`SERVICE_VERSION`, `TABLES` and `FUNCTIONS`. It is the file to read when a
question is about the API's *shape* rather than about CloudFormation: how many
routes, which are public, what a table is keyed by, what IAM each table needs.

`src/bundling.ts` turns a `FunctionSpec.entry` into the Lambda asset and the
handler string. Nothing holds a second mapping from a function to a file, so
nothing can hold one that disagrees with the source tree.

**It was generated once and is edited by hand from here.** Adding a route means a
`FunctionSpec` in that table and a file at its `entry`.

## The bundler

```bash
npm run bundle --workspace achar-infra            # build what is stale
npm run bundle --workspace achar-infra -- --force # rebuild everything
```

`scripts/bundle.mjs` bundles all 39 handlers — 38 routes plus the queue consumer
— into `infra/dist/<entry>/index.js`, which the stacks reference with
`Code.fromAsset`. It hashes every handler and shared package source file and skips
the whole build when nothing changed, which is what lets the console's plan treat
"the handlers are current" as a *check* rather than a step.

`@aws-sdk/client-*` is left out of the bundles because the Node 22 Lambda runtime
ships AWS SDK v3 clients. Everything else is bundled, including
`@aws-sdk/lib-dynamodb` and `@aws-sdk/s3-request-presigner` — those are utilities
rather than clients and are not part of the runtime's documented set.

## Why the app is TypeScript that `node` runs directly

`cdk.json` says `"app": "node bin/achar.ts"`. Node 26 strips types natively, so
there is no `ts-node`, no build step before `synth`, and no toolchain that can
drift out of step with the TypeScript version. Two consequences, and they are
real constraints rather than preferences:

- **Relative imports carry the `.ts` extension.** Node resolves files, not module
  specifiers, so `import { loadConfig } from '../src/config.ts'` is the form that
  works. `tsconfig.json` sets `allowImportingTsExtensions` to match.
- **Type-only imports must say so.** `import type { FunctionSpec } from
  '../types.ts'` is erased; a plain `import` of a type would survive into the
  JavaScript and fail at load with "does not provide an export named". The same
  goes for `export type`.
- **No `enum`, `namespace`, or constructor parameter properties.** They are not
  erasable, and Node refuses them by design. Union types and `const` objects stand
  in for enums here, which is the better habit anyway.

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/bundle.mjs` | Bundles every handler, skipping what is current |
| `scripts/import-state.mjs` | Writes a config file from an existing deployment |

Both are invoked by the console. Neither deploys anything.

## What this app does not do

- **It does not look anything up at synth time.** No `valueFromLookup`, no AWS
  call during `synth`. A lookup that misses does not fail — it returns the
  *parameter name*, which is then baked into thirty-eight Lambdas' environments
  as a table name and surfaces as a 500 at the first request.
- **It does not deploy.** `npm run deploy` and `cdk deploy` are yours to run, or
  the console's button is.
- **It does not create the Google client secret.** `AcharAuthStack` reads it from
  Secrets Manager by name; the console's Checklist tab is what puts it there.
