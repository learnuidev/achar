# Console build brief (temporary — delete when the build is done)

You are building part of `apps/console` in `/Users/vishalgautam/Desktop/wip/achar`,
the control room of this monorepo. It is the direct counterpart of
`/Users/vishalgautam/Desktop/wip/play/apps/play` — **read play's version of every
file you write, and adapt it.** Do not invent a different shape: mirror its
structure, naming, idioms, comment register and reasoning, changing only what
Achar's product makes different.

## House style, exactly

- **Comments explain why, never what.** Read play's `src/server/plan.ts`,
  `src/server/aws.ts` and `src/lib/types.ts` for the register: a comment justifies
  a decision, names a rejected alternative, or explains a failure mode. No emoji.
  Plain sentences, `—` for asides, backticks for identifiers.
- **No arbitrary Tailwind values.** `text-[15px]` is forbidden. Only token
  utilities: `bg-background`, `text-foreground`, `text-muted-foreground`,
  `bg-muted`, `bg-card`, `border-border`, `bg-primary`, `text-primary-foreground`,
  `bg-accent`, `text-destructive`, `bg-destructive`, `bg-success`, `text-success`,
  `bg-warning`, `text-warning`, `bg-info`, `bg-run`, `text-run`, and the
  `foreground/8`-style opacity modifiers those tokens support, plus
  `rounded-lg/xl/2xl` (and `rounded-full`). Sizes come from the scale
  (`text-xs/sm/base/lg`), never from a bracket.
- TypeScript 7, `strict: true`, no `any`. Next 16 App Router, React 19.
- **Next 16 specifics:** in pages *and* route handlers, `params` and
  `searchParams` are `Promise`s and must be `await`ed. `cookies()`/`headers()` are
  async. Play is Next 14 — everywhere it destructures `params` synchronously, you
  must await.
- No `next/font/google` (it fetches at build time; the build must work offline).
- **The console imports no `@achar/*` package**, on purpose — see
  `apps/console/next.config.mjs`. Never import one.
- Never write a throwaway script. Never commit.

## Achar's facts

| | Value |
| --- | --- |
| Repo dir | `achar` |
| Config file | `infra/config/achar-<stage>.json` |
| Stacks | `AcharDataStack-<stage>`, `AcharMediaStack-<stage>`, `AcharAuthStack-<stage>`, `AcharWebhookStack-<stage>`, `AcharApiStack-<stage>` |
| Apps | `web` 3000, `studio` 3001, `console` 3002, `demo` 3003 |

Stack outputs, all real:

- Api: `ApiUrl`, `ApiId`, `RouteCount`
- Media: `AssetsBucketName`, `CloudFrontDomain`, `CloudFrontDistributionId`
- Auth: `UserPoolId`, `UserPoolClientId`, `UserPoolDomain`, `GoogleSignInEnabled`, `GoogleCallbackUrl`
- Webhook: `WebhookQueueUrl`, `WebhookQueueArn`, `WebhookDeadLetterQueueUrl`
- Data: one `<TableId>Name` output per table. The ten ids are `ProjectsTable`,
  `MembersTable`, `DatasetsTable`, `SchemasTable`, `DocumentsTable`,
  `AssetsTable`, `TokensTable`, `WebhooksTable`, `DeliveriesTable`,
  `ProfilesTable`. Physical names are `achar-<stage>-<kebab-of-id>`, e.g.
  `achar-dev-documents-table`.

The env variables each frontend is handed, in `apps/<app>/.env.local`:
`NEXT_PUBLIC_ACHAR_API_URL`, `NEXT_PUBLIC_ACHAR_REGION`,
`NEXT_PUBLIC_ACHAR_USER_POOL_ID`, `NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID`,
`NEXT_PUBLIC_ACHAR_AUTH_DOMAIN`.

Achar is a **structured-content platform** (a headless CMS: projects, datasets,
schemas, documents, assets, tokens, webhooks), not a video learning platform.
There is **no Stripe**, **no CloudFront signing key**, **no Vercel** anywhere.
The console's own probe of a deployed API is `GET <ApiUrl>/v1/info` (the one route
with no authorizer). Frontends have **no cloud deploy target**: the console starts
their `next dev` locally, writes their `.env.local`, and can run `next build` as a
tracked step. Do not build a Vercel integration.

## The frozen contracts (already written — read them, do not change them)

- `src/lib/types.ts` — every shape the server sends and a page draws.
- `src/lib/backends.ts` — `STACK_WORDS`, `backendPath`, `BackendState`,
  `backendState`, `runningFor`, `runProgress`, `backendBlurb`, `BACKEND_TABS`.
- `src/lib/frontends.ts` — `FRONTENDS`, `frontendOf`, `frontendPath`, `STATUS`,
  `isLive`.
- `src/lib/format.ts` — `duration`, `clockTime`, `relative`, `apiHost`,
  `stackWord`, `stackInitials`, `bytes`, `plural`.
- `src/lib/ranges.ts` — `METRIC_RANGES`, `DEFAULT_RANGE`, `rangeFor`,
  `windowLabel`.
- `src/components/ui/` — `button.tsx` (`Button`, `IconButton`), `card.tsx`
  (`Card`, `CardHeading`), `chip.tsx` (`Chip`, `Dot`, `Spinner`, `Tone`),
  `field.tsx` (`Field`, `TextInput`, `TextArea`, `Checkbox`), `tabs.tsx`
  (`Tabs`, `useTabParam`, `TabDefinition`), `picker.tsx` (`Picker`),
  `copy-row.tsx` (`CopyRow`), `table.tsx` (`Table`, `THead`, `TBody`, `Tr`, `Th`,
  `Td`), `prose.tsx` (`Prose`, `InlineProse`), `env-table.tsx` (`EnvTable`).
  **Do not edit these** — if you need another primitive, put it in your own file.
- `src/server/repo.ts` — `repoRoot`, `repoPath`, `APPS`, `appDefinition`,
  `appDir`, `nextBin`, `cdkBin`, `profileSetting`, `defaultRegion`,
  `CONSOLE_APP`.
- `src/server/exec.ts` — `run`, `display`, `stripAnsi`, `lastMeaningfulLines`,
  `PipedChild`, `RunOptions`, `RunResult` (identical to play's).
- `src/server/aws.ts` — `AwsContext`, `awsJson`, `getIdentity`, `identityError`,
  `awsCli`, `ROOT_STACKS`, `rootStackNames`, `stackHealthy`, `stackLabel`,
  `describeStack`, `describeStacks`, `CloudStack`, `snapshotAcharStacks`,
  `summariseStacks`, `listBuckets`.
- `src/server/environments.ts` — `StageConfig`, `ownershipOf`, `ownsEverything`,
  `configFile`, `readConfig`, `writeConfig`, `configProblems`, `listStages`,
  `pickSeedStage`, `newStageConfig`, `StageOutputs`, `stageOutputs`,
  `environmentView`, `consoleDefaults`, `googleClientSecretName`,
  `FRONTEND_ENV_KEYS`, `frontendEnvPath`, `readFrontendEnv`, `writeFrontendEnv`.
- `src/server/plan.ts` — `StepContext`, `StepOutcome`, `CheckOutcome`,
  `LockName`, `PlanStep`, `buildPlan(stage)`, `buildDestroyPlan(stage, opts)`.
- `src/server/run.ts` — `RunSpec`, `currentRun(kind, key)`, `isRunning`,
  `activeRuns(kind)`, `runTranscript`, `backlog`, `subscribe`, `startDeploy`,
  `startDestroy`, `startBuild`, `startRun`, `cancelRun`, `previewSteps`, `stepsOf`.
- `src/server/run-api.ts` — `stageFromBody`, `destroyFromBody`, `appFromBody`,
  `transcriptResponse`, `eventsResponse`.
- `src/server/settings.ts` — `googleClientSecretName`, `readSettings`,
  `googleSecretStatus`, `googleOAuthValues`, `saveSettings`, `settingsContext`.
- `src/server/tables.ts` — `AwsReadContext`, `stageTableNames(stage, ctx?)`,
  `backendTables(stage, ctx?)`, `TableShape`, `describeTable(name, ctx?)`,
  `TableQuery`, `readTableItems(query, ctx?)`, `typeFor(shape, attribute)`.
- `src/server/metrics.ts` — `functionMetrics(name, minutes, ctx?)`.
- `src/server/logs.ts` — `EVENT_DRIVEN`, `backendFunctions(stage, ctx?)`,
  `recentLogs(query, ctx?)`.
- `src/server/backend.ts` — `CONSUMERS`, `FRONTEND_OUTPUTS`, `OUTPUT_ENV_NAME`,
  `OUTPUT_LABEL`, `backendEnv(stage, ctx?)`, `stackOutputs(stage, ctx?)`,
  `deploymentHistory(stage, ctx?)`, `backendContext()`.
- `src/server/services.ts` — `listServices()`, `subscribeServices()`,
  `servicesBacklog()`, `StartServiceOptions`, `startService(options)`,
  `stopService(app)`, `installCleanup()`, `buildBuildPlan(app, stage)`.
  **`services.ts` must not import `run.ts`** (the build runs through `run.ts`,
  which imports `buildBuildPlan`).
- `src/server/frontends.ts` — `frontendEnv(app, stage, ctx?)`.
- `src/components/console/state.tsx` — `ShellProvider`, `useShell()`,
  `useNameStage()`, `Theme`, `useTheme()`.
- `src/components/console/shell.tsx` — `ConsoleShell`.

`ctx?` everywhere is `Partial<AwsContext>` — `{ profile?, region? }`.

## Routes and pages (the whole surface)

```
/                        who you are, every environment and its state, and the deploy button
/backends                the list of environments, a state chip and a Deploy button each
/backends/[stage]        tabs: Checklist · Env · Deployments · Logs · Tables
/frontends               the four apps, whether each is running, and where
/frontends/[app]         env variables against one stage, start/stop, and the dev server's logs
/integrations/aws        who the CLI is, which account and region, and what is in it
```

```ts
// src/app/api/
state                                  GET, cached ~5s
plan                                   GET
deploy                                 POST start / GET read / DELETE cancel — ?stage=
deploy/runs                            GET — every run going right now
deploy/events                          SSE transcript
deploy/transcript                      GET one step's lines after the fact
deploy/destroy                         POST
services                               GET
services/[app]                         POST (start, or { action: "build" }) / DELETE
services/events                        SSE
environments/[stage]/settings         GET/PUT
backends/[stage]/env                   GET
backends/[stage]/deployments           GET
backends/[stage]/logs                  GET — ?function= &q= (CloudWatch filter pattern) &minutes=
backends/[stage]/metrics               GET
backends/[stage]/tables                GET — ?table= plus attribute/operator/value/type
frontends/[app]/env                    GET
```

## The deploy plan (already written in `src/server/plan.ts`)

Eleven steps, each a `check` and an `apply`:

1. The tools are on this machine — `aws`, node ≥ 20, and the workspace's `cdk`
2. This machine can act on the account — `sts get-caller-identity`, matching the config's account
3. The environment's resources are named — `infra/config/achar-<stage>.json`
4. CDK is bootstrapped in this account and region — `CDKToolkit` is settled
5. The handlers are bundled — `node infra/scripts/bundle.mjs`, "Nothing to rebuild" counts as satisfied
6. The templates synthesize — never satisfied; this one validates
7. The five stacks deploy — `cdk deploy --all --context stage=<stage>`, "nothing to change" is success
8. Every stack is complete, with its outputs — every `ROOT_STACKS` name is settled and carries `ApiUrl`
9. The four apps point at it — every `.env.local` reads this stage's `ApiUrl`; **this step writes them**
10. The API answers — `GET <ApiUrl>/v1/info` returns 200
11. The pool's app client accepts the app URLs — the config's `auth.callbackUrls` include each app's origin

## The destroy plan

The stacks and the config file, and behind a checkbox the data; it **refuses**
before destroying anything when another stage's config names the same table,
bucket, distribution or pool; it is a plan of steps rather than one `cdk destroy`
behind a button; and the button asks for the stage's name to be typed.

## Running things

`npm_config_cache=/Users/vishalgautam/Desktop/wip/achar/.npm-cache` if you invoke
npm. Dependencies are installed — never install anything.

Typecheck your work with:

```
cd /Users/vishalgautam/Desktop/wip/achar
./node_modules/.bin/tsc --noEmit -p apps/console/tsconfig.json
```

It will report errors from files other agents are still writing. **Only fix errors
in the files you own**; report the rest.
