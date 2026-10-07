# `apps/console` — the control room

A local control room for the backend. It answers the three questions that
otherwise live in a shell history nobody can read:

- **Backends** — every environment the API has been deployed to, what each one
  was deployed with, what a new one needs before it can be deployed at all, and
  how a new one starts;
- **Frontends** — the four apps, what each one is handed, and where they run;
- **Integrations** — the AWS account the console acts as, and what this
  repository has put in it.

```bash
npm run console         # from the repository root
open http://localhost:3002
```

It is not deployed anywhere, and it is not an Achar product surface. It runs on
your machine, with your AWS profile, and its subject is this checkout.

## The shape of it

The unit is **a backend, in an environment** — the whole console is about that
one sentence, so everything is downstream of it:

```
Frontends        /frontends        all four, what is up, and Start
                 /frontends/<app>  one of them — Env variables · Build · Logs
                                   ×  an environment

Backends         /backends         every environment, what is deployed, and
                                   Deploy to a new backend env
                 /backends/<stage> one of them — Checklist · Env variables ·
                                   Deployments · Logs · DynamoDB tables

Integrations     AWS               who the console acts as, and what is in it
```

`/` is **who you are, every environment and its state, and the deploy button**:
the console's own front door rather than a redirect, because the first thing
somebody opening a control room wants is the account it is about to act on and
the environments that account holds.

Which one, and against what, are **two dropdowns at the top of the page they
belong to**, in the same place, because they are the same shape of question. On
both lists the first of them *opens* something rather than selecting it in place:
a frontend, or an environment's backend. Both are routes, so one app's output and
one environment's stacks are each linkable, the back button returns to the list,
and the list keeps saying what all of them are doing while you read about one.
The environment dropdown on a frontend's own page is the shared stage, and it
writes the state the whole console reads, so moving between pages keeps the
environment you were looking at — and `/backends/<stage>` sets that same stage on
the way in, because the environment in the URL is the one the rest of the console
should be looking at.

Starting a frontend is **above the tabs**, beside the environment it would be
started against: it is the page's subject rather than one of its three views. A
backend's page has the same shape — a short **Deploy** in the corner of its
header, beside the stage's name and state — and it is the *same press* as the
Deployments tab's and as the list row's, because it is the same component
(`backends/deploy-button.tsx`). Two implementations of a control that writes to
AWS would be two answers to "what does this button say while a run is going", and
that is the one question about it that has to have one answer.

What the header's Deploy is *for* is the fourth deploy of an environment that has
been up for months. The Deployments tab is still where a first one is read: it
holds the eleven-step checklist and the transcript, and the header button's own
title says it runs the same plan. It is the small secondary button rather than
the primary one, so the tab's button remains the page's subject.

The stage's **address** sits on its own line under its name rather than in that
corner: it is what the environment *is* — the thing somebody pastes into a
client, an `.env` or a bug report — and not a control competing with the one
button above the tabs.

### Why `/backends` is a list of environments

There is one backend: the CDK app in `infra/`. The plural is about *where it has
been deployed*, so a row is a stage, and everything a row says is a fact about
five CloudFormation stacks — which are complete, whether this environment creates
its own tables, bucket, distribution and pool or imports another stage's, and
where its API is. Every environment exists whether or not anything has been
deployed to it, so the rows come from the repository's own list and the stacks
only fill each one in: a list drawn from the deployed stacks would be empty on a
fresh checkout, which is exactly when the first deploy has to happen.

**A new environment creates everything.** `ownership` in
`infra/config/achar-<stage>.json` is all three `true` for a stage that has never
existed: ten DynamoDB tables named `achar-<stage>-*`, an assets bucket named by
CloudFormation, a CloudFront distribution, a Cognito user pool and a delivery
queue — all empty, all its own, and none of them importable by another stage
accidentally. It is the default the console writes and the reason "deploy to a
new environment" means what it sounds like. `false` means "import this instead",
which is what a stage whose resources predate this CDK app needs; an imported
resource is unmanaged, so CloudFormation will not change it and will not delete
it, and that is the entire point.

**Deploy to a new backend env** asks for a name and then *opens* that
environment's page on its checklist — `/backends/<stage>?tab=checklist`. It does
not start a run, and that is the point of it: a new environment needs its config
file first, the plan's third step is what writes one, and what the plan will do is
worth reading before it is run. The name is the only thing this console cannot
read off AWS.

There is therefore **no 404 for a stage nobody has configured** — that page is the
one this console most needs to draw, and `/backends/staging` works the moment
somebody has thought of it. A name that could never be a stage *is* a 404, because
the alternative is a page about nothing.

The environment is deliberately not in the rail. A list there would be a second
place to select the same thing, which is a second answer to one question — and
naming a new one lives on the list where the environments are, rather than in the
chrome, so the rail is left with the three parts of the problem instead of a menu.

### Which tab, in the URL

An environment's page and a frontend's are each a strip of tabs over one page, and
**which tab is showing is `?tab=`** — `useTabParam` in `components/ui/tabs.tsx`,
shared by both. So `/backends/staging?tab=logs` is a link somebody can be sent, a
reload lands where the reloader was, and the tab a new environment opens on comes
from the same parameter the strip writes. Anything the list does not know — a
typo, a tab that has been renamed — is the first tab rather than an error, which
is what makes the parameter safe to leave out.

Switching a tab **replaces** the current history entry rather than pushing one. The
back button on these pages is documented above as leaving the page for the list,
and a `push` per tab change would quietly turn it into a walk back through the
strip. `scroll: false` for the same kind of reason: `router.replace` scrolls to
the top by default, and a strip halfway down a long page would jump out from under
the pointer that clicked it.

**A row that is deploying says so.** Its chip reads *deploying*, with a spinner
rather than a dot, and the line underneath is the step the run is on rather than
the stack count — because a deploy in flight leaves exactly the half-built set of
stacks that *partly deployed* describes, so the row that would otherwise shout
loudest is the one that is working correctly. That verdict comes from
`/api/deploy/runs`, which is this process's own memory and free to read, and not
from `/api/state`, which is cached and costs an `aws` process — a deploy's
progress is stale within seconds, a stack's status is not. The same function
draws the chip on the environment's own page and on the deploy card, so a row
cannot say "deploying" above a page that says "partly deployed" — **though only
the row spins.** On the environment's own page that chip is a still dot: the
checklist underneath it is the progress, with a bar and the step being worked on,
and an indicator turning beside it says the same thing a second time. While that
is true the row's **Deploy** button is disabled rather than hidden, because the
chip beside the name already says why — and a refusal the server *does* send, from
the race between two tabs, is printed in the row rather than swallowed.

### Checklist — what a person has to supply

The tab a new environment starts on, and the only one that is a *question* rather
than a report. Three rows, each a requirement with a tick or a sentence about what
is missing:

| Row | Met when |
| --- | --- |
| The config file | `infra/config/achar-<stage>.json` exists — saving the credentials below is what writes a new environment's |
| Google sign-in | there is a client id, a secret in Secrets Manager, and callback and logout URLs |
| Mail and origins | the invitation sender and the three app base URLs |

The form below the rows is the credentials form, and it is open by default
whenever something is missing: a page that told you the credentials were absent
and then made you go and find the form would have wasted the hint. A stage with
no config file gets a **draft** rather than an error — the product's values under
this stage's name, carried over from a stage that has them — so the first save is
what creates the environment. The card above it prints the two values Google has
to be told, derived from the pool's future domain, because registering the OAuth
client is the step *before* pasting the id and secret — and it is there on every
stage, not only on one that is missing something, since the values are outputs to
copy rather than fields to fill in.

**The secret never touches the repository.** It is write-only in both directions:
sent to Secrets Manager on save, never read back, and the page shows only whether
one is stored. That is not fastidiousness — the config file is committed, and a
credential in it would be a credential in the history of every clone. Secrets
Manager rather than SSM because CloudFormation refuses an SSM Secure reference in
`AWS::Cognito::UserPoolIdentityProvider`; `infra/src/config.ts` has the error
message and the reasoning.

Saving is validated before anything is written or sent: a client id that does not
end in `.apps.googleusercontent.com`, a callback URL that is neither https nor
localhost, a base URL without a scheme, a malformed email — all caught and
reported together, rather than surfacing as a Cognito rejection in the middle of
an auth-stack rollback.

### The other half of the conversation

A federated sign-in involves Google, Cognito and the app, and **Google has to be
told two things it cannot derive** — so the page prints them, ready to copy, in a
"What Google has to be told" card. It sits directly **above** the credentials
form, because it is first in the workflow: you register the OAuth client in
Google, Google asks for these two, and only then does it hand back the client id
and secret the form below wants.

| Google client field | Value |
| --- | --- |
| Authorized JavaScript origins | `https://<cognito-domain>` |
| Authorized redirect URIs | `https://<cognito-domain>/oauth2/idpresponse` |

where `<cognito-domain>` is `achar-<stage>-<account>.auth.<region>.amazoncognito.com`
for an environment that creates its pool, and whatever an imported pool was given
for one that imports it. The auth stack publishes the *prefix* —
`achar-<stage>-<account>` — because that is what Cognito is given at creation, so
the hostname is assembled from it, and the stack's own `GoogleCallbackUrl` output
is preferred when there is one: a name that appeared in both places would
otherwise be a second answer to "which URL does Google call".

**Two lists, and both are needed.** These two say where *Google* may send a
person; `callbackUrls` says where *Cognito* may send them afterwards. Google
returns to Cognito, Cognito returns to the app. Missing either one fails sign-in —
and the first fails as a `redirect_uri_mismatch` page that names nothing in this
repository.

### Env variables — inputs, and outputs

The one tab that is not the same on both pages, because the two directions are
opposite. It is read-only on both — a backend's values are *written* on the
Checklist tab, a frontend's are handed to it when it starts — and what it adds is
where each one comes from and who reads it.

- **A backend's inputs** are what a *person* supplies, because nothing can
  discover them: the Google OAuth client, its secret, the origins Cognito will
  accept, the three app base URLs. They are written by the form on the Checklist
  tab and read by a deploy.
- **A backend's outputs** are what the *deploy* produces — the API URL and its
  route count, the pool, its app client, the Hosted UI domain, the assets bucket,
  the distribution, the delivery queue, and a name for each of the ten tables.
- **A frontend's variables** are those same outputs with different names. A
  frontend has none of its own; the table's job is to show the copy each one is,
  and where it came from.

Calling all of it "environment variables" would hide the only thing worth knowing
about any of it: which direction the value travels, and who reads it.

### Deployments

For a backend, this tab *is* the deploy page — the eleven-step checklist, the
transcript, the button — plus what CloudFormation has actually done, read from the
stacks rather than remembered by this process, plus the card an environment is
deleted from at the very bottom. A history kept on `globalThis` would begin when
you opened the page. The environment it is about comes from the URL rather than
from the shell's selection: `/backends/<stage>` *is* that environment, and a
checklist that drew another stage's step notes while the shell caught up would be
a page about two environments at once.

For a frontend it is where the app is built: locally, by this console, from the
same `.env.local` a dev server would read.

### Two environments at once

There is **one run per environment**, not one run per console. `staging` and
`dev` deploy side by side, each with its own checklist, transcript, result and
Stop button, and the page you are reading is scoped to the environment in its
URL — `/backends/staging` polls *staging's* run and streams *staging's*
transcript, and never the other one's. Two requests for the *same* stage are
still refused by name, because two `cdk deploy --all` runs against one set of
stacks do not compose.

Three things make that safe rather than merely allowed:

- **Each stage synthesizes into its own directory** — `cdk.out/<stage>`. That
  directory is the whole of what a deploy reads, templates and staged assets
  together, so two runs sharing the default `cdk.out` would each read the other's
  templates and report a diff for stacks nobody asked about. It is also deleted
  before each synth, because CDK never prunes an assembly: every build leaves its
  staged assets beside the previous one under a new content hash, which is how one
  staging directory reaches a gigabyte.
- **The steps that touch something shared hold a named lock.** `plan.ts` marks
  them, and `server/run.ts` queues them: `infra/dist` (one bundle for every
  stage) and `apps/<app>/.env.local` (one file per app) are `checkout`, and
  `CDKToolkit` (one stack per account and region) is `account`. They are two names
  rather than one lock so that a staging bootstrap does not hold up a dev bundle.
  A step that has to wait says so in its transcript, with the reason, because a
  run parked for four minutes with no output reads like a hang.
- **What cannot be made private is left as it is, and said out loud.**
  `.env.local` is one document per app and it names one environment at a time, so
  a parallel deploy of `staging` leaves the apps pointed at `staging` and away
  from `dev` — exactly as deploying them one after the other would. An environment
  that creates everything shares nothing else.

The deploy page says when another environment is deploying, so the button never
looks contended: what it tells you is that the run next to it is somebody else's.

### Logs

For a backend, one function at a time — and three things about it: what it did,
what it said, and a way to search what it said.

**One function at a time**, because `FilterLogEvents` takes a single log group
and an environment has thirty-nine of them: fanning out per request would be
thirty-nine API calls to draw a screen. The event-driven ones come first because
they never answer a request and therefore have nowhere else to say anything — in
Achar that is the webhook delivery function, which is woken by a queue.

**The list of functions is `DescribeLogGroups` with the stage as a name prefix**,
not `lambda list-functions`. That is not a preference: `list-functions` is
paginated account-wide, so filtering it by name in this process shows a stage's
Lambdas *only if they happen to fall in the first page*. A prefix query is
filtered by the service, so it is complete whatever else the account holds, and it
is the more honest source for a tab that reads logs: a function with no log group
is a function this tab has nothing to say about. Each row also carries **how many
bytes of log it holds**, which is how you find the function filling CloudWatch up.

**The function is searched for, not selected from a list.** Thirty-nine names in a
`<select>` is a control you scroll rather than one you use. So there is a search
box — substring, case-insensitive, over the key *and* the deployed name, because
the string somebody has is often the one out of a stack trace — and the matches
appear **only while something is typed**: the list is the answer to a search
rather than a piece of furniture. Enter opens the first match, Escape puts the
box back, and the matches scroll rather than page.

**It remembers what you were looking at**, per stage, in `localStorage`: the
function last opened is reopened on the next visit, and the handful before it are
offered as chips under the search box. That is the same reasoning the shell uses
for the selected environment — a console that forgets is one you re-navigate every
time — and the history is keyed by stage because `query` is `query` in every
environment while *which* ones you are working on is not. What is **not** stored
is the query text: restoring a filter on load would hide most of the list from
somebody who has not typed anything, and the thing worth coming back to is the
function, not the string that found it.

#### Activity — the chart

Above the lines, what the function has been doing: `Invocations`, `Errors` and
`Duration`'s **p95**, out of CloudWatch. A p95 rather than an average because an
average hides exactly the tail that a latency number is for, and it is the one
question a transcript cannot answer — a slow invocation and a fast one look
identical in a log.

**Two scales, and two colours.** The counts share the left axis and the
milliseconds get the right one, because drawing all three against one scale is
what makes these charts useless — 400 ms flattens every bar, or the bars flatten
the latency to nothing. `run` is the latency line and `destructive` is the error
bars, the same tones the chips use; invocations are the muted foreground, because
"it ran" is not news.

**The series are filled in before they are drawn.** CloudWatch omits the periods
it has no data for rather than answering zero, so an idle hour would otherwise
collapse to no width at all — and a chart of "is this being called" that cannot
show an idle hour is not a chart of anything. `durationP95` stays `null` in a
quiet slot rather than becoming `0`: no invocations is not a fast response.

The chart is an inline `<svg>` and about eighty lines of arithmetic. A charting
library is 40 kB to draw one line and two bars, and everything it would draw with
comes from this app's own tokens anyway.

**The range buttons are the page's one clock.** `1h`/`3h`/`24h`/`7d` governs the
chart *and* the lines below it: "what did this function do" and "what did it say"
are one question asked twice, and two range controls would be two answers to it.
`lib/ranges.ts` is the one list, because the buttons and the `get-metric-statistics`
period have to agree — CloudWatch answers at most 1440 datapoints, so an hour is
read a minute at a time and a week an hour at a time.

#### Searching the lines

The search box under the transcript goes to CloudWatch as a **filter pattern**,
not a filter over what is already on screen — which is the difference between
finding the one error in an hour of noise and finding the one in front of you. It
is a button rather than a keystroke filter for the same reason: one press is one
read, where a filter that ran as you typed would be one read per character.
CloudWatch's own syntax works there — a bare word, `"two words"` for a phrase,
`?one ?two` for either, `{ $.level = "error" }` for a JSON term — and it is
case-sensitive, which the hint says rather than leaving somebody to conclude their
logs are empty.

#### Reading the lines

Every line is taken apart before it is drawn (`lib/logs.ts`), because a CloudWatch
pane is a column of monospace in which the error and the report saying the
function is one payload away from running out of memory look exactly like the 190
`INFO` lines around them:

| Line | Drawn as |
| --- | --- |
| `START` / `END` | a muted tag and the version — a request's bookends |
| `REPORT` | its numbers as label/value pairs, with the memory in the warn tone when it is within 80% of the limit |
| `ERROR Invoke Error {…}` | the message in the destructive tone, with the type and the stack beneath it |
| the handler's JSON | its `msg` as the line, and the rest of the object beside it as `{ key: value }` |
| anything else | the text |

The **request id** is drawn once per line as a short muted chip rather than left
inside the text: it is how one invocation is followed through a busy function.
The runtime's own framing prefix — `2026-09-01T13:49:31.406Z\t<id>\tINFO\t` — is
stripped, because the timestamp is already the column beside it and both halves
are already shown as their own.

For a frontend: the `next dev` output, straight from the process the console
started — including one started before the page was opened, because the server
keeps the buffer.

### DynamoDB tables — the one view that reads the product

Everything else in the console describes the *deployment*: what it needs, what it
published, what CloudFormation did, what it logged. This tab reads the rows —
whether a webhook was delivered, whether a document was published, whether a
dataset's schema is the one somebody saved. Those questions otherwise end in a
terminal and a shell history nobody else can read, which is this console's whole
reason for existing.

The table is picked first, because everything below it is about that table, and
there are then **two views** of it — `?view=`, so `?tab=tables&view=info` is a
link somebody can be sent:

| View | What it is |
| --- | --- |
| **Data** | A page of rows, as a table (sortable within the page) or as JSON. The JSON is the CLI's own output, `{ S: … }` wrappers and all, because that is the form that can be pasted back into `put-item` |
| **Info** | What the table *is*, from `DescribeTable`: status, size, key schema, indexes — and the row count, which DynamoDB refreshes about every six hours rather than per write |

**Aiming a read is a button on the Data view, not a third view.** Pressing
**query** opens the form *over* the table and pressing it again puts it away: a
query is something done to the rows in front of you, so the rows stay where they
are and the answer appears under the form that asked for it. As a view it would
have made "where am I" and "what am I doing" the same question, and running a
query would have moved you somewhere to show you the result.

The form is an attribute, an operator, a value and a type. **The two calls are not
the same read, and the tab says which one it made.** A `Query` needs a partition
key, and this tab knows which attributes those are because `DescribeTable` says
so: asking about a key is one round trip that reads what it returns. Anything else
is a `Scan` with a filter, which reads the table and throws away what does not
match — so the read is written out above the rows and the counts underneath say
how many rows it actually read. The keys are offered as buttons, because that is
the difference between one round trip and a full table read and nobody should have
to read a schema to take it.

Two smaller decisions worth knowing. The **type** of a value is always part of
what the tab says — `S`, `N`, `BOOL`, in words — because `172348` and `"172348"`
look identical and match differently, and a read that matched nothing says so when
the value looks numeric. And the **rows are sent to the browser exactly as
DynamoDB answered them**: both renderings come from one read, and a mapping in the
server would be a second answer to "what does this row say" that only one of them
used.

**It reads and never writes.** `DescribeTable`, `Query`, `Scan` — there is no edit
field and no delete button anywhere on it, deliberately: a control room that can
change the product's rows is one where a slip is content loss with no undo.

## Why it is a step at all

`cdk deploy` is one command, and the checklist around it is the point. A stage
that has never been deployed needs a config file, a bootstrapped account, a
bundled `dist/`, five stacks and a running API — in that order, some of which fail
in ways that name nothing anybody can act on. One of them is an idempotent script
it is easy to run twice and hard to know you needed to run once.

So the plan is written down, in `src/server/plan.ts`, as eleven steps. Each step
is a **check** and an **apply**: the check asks "is this already true?", and when
it is, the step is a check mark with the reason beside it and nothing is run. That
is what makes a second press of the button cheap — on an environment that is
already up, most of the plan reports *already satisfied*. `buildDestroyPlan` sits
beside it with the five or eleven steps that go the other way, and the same
check-first discipline.

| # | Step | Already satisfied when |
| --- | --- | --- |
| 1 | The tools are on this machine | `aws`, the workspace's `cdk` and a Node ≥ 20 all resolve |
| 2 | This machine can act on the account | `sts get-caller-identity` works **and matches the account the config names** |
| 3 | The environment's resources are named | `infra/config/achar-<stage>.json` exists, parses, and names the caller's account |
| 4 | CDK is bootstrapped in this account and region | the `CDKToolkit` stack is settled |
| 5 | The handlers are bundled | the bundler reports **Nothing to rebuild** |
| 6 | The templates synthesize | never — this one validates |
| 7 | The five stacks deploy | never — `cdk deploy` is run, and reports "nothing to change" as a *satisfied* step |
| 8 | Every stack is complete, with its outputs | every root stack is settled and carries `ApiUrl`, `UserPoolId`, `UserPoolClientId` and `AssetsBucketName` — the list is `ROOT_STACKS` in `src/server/aws.ts`, so a stack added to the CDK app and not to it is a stack the console would report an environment complete without |
| 9 | The four apps point at it | every `.env.local` already reads this stage's `ApiUrl` |
| 10 | The API answers | `GET <ApiUrl>/v1/info` returns 200 |
| 11 | The pool's app client accepts the app URLs | the config's `auth.callbackUrls` include each app's origin — **and** the running client does |

Steps 5 and 7 have no check on purpose, and they are the two where running the
tool *is* the check: `bundle.mjs` keeps a fingerprint of the service's own source
and knows what is stale, and `cdk deploy` against an unchanged environment is a
no-op. Both report "nothing to do" as a success, and the run draws that as a
satisfied step rather than a tick for work that did not happen.

### Step 3: what makes "a new environment" mean something

A stage that already has a file skips this. For a stage that does not there are
exactly two cases, and they are not interchangeable:

- **The stacks are there and the file is not.** The resources are real, so the
  documented path applies: `infra/scripts/import-state.mjs` reads them out of AWS
  and the file names them. This is the only case in which a stage imports
  anything, and `ownership` says so afterwards.
- **The stage has never existed.** There is nothing to discover and nothing to
  import, so the file is written with `ownership` set for all three groups, which
  tells the stacks to **create** the tables, the bucket, the distribution and the
  pool — all empty, all this stage's own, all retained if the stack is deleted.

Seeding a new stage from `dev`'s file would copy ten physical table names along
with it: a stage that reads like a new environment and behaves like a second front
door to the same database. This step does not do that.

What *is* carried over is product configuration rather than per-environment state:
the mail addresses, the Google client id, and the callback and logout URLs. Those
are the same product in every environment, and a stage that invented its own would
be a stage whose sign-in redirects nowhere.

### Step 7, and the export CloudFormation will not delete

A cross-stack reference in this app is a CloudFormation **export** — the API stack
reads the assets bucket, the user pool and its app client, and the delivery queue
— and CloudFormation refuses to delete an export that another stack still imports:

> Delete canceled. Cannot delete export
> AcharMediaStack-test:ExportsOutputRefAssetsBucket… as it is in use by
> AcharApiStack-test, … (and 1 more).

`cdk deploy --all` deploys the stack that *provides* an export before the stacks
that read it, so the change that **stops** exporting something cannot land in a
single pass: the provider runs first, is refused, and the readers — whose new
templates no longer import it — never get their turn. A person would have to
deploy the readers on their own (`cdk deploy AcharApiStack-<stage> --exclusively`)
and then everything, and then check that they got the order right. That is exactly
the sort of thing a Deploy button should not need to be told.

So the step does it. On a non-zero exit it reads the export's name out of the
failure, asks CloudFormation who still imports it (`list-imports`, because that
sentence truncates at "(and 1 more)"), deploys those root stacks on their own, and
deploys everything again. What the transcript shows is one red stack, a sentence
saying what is being done about it, and a step that ends satisfied.

Two deploys is not a retry: the first one genuinely cannot succeed. It is the one
transition `--all` cannot express, and it happens when a resource is replaced by
one with a different logical id.

### Step 11, and the two places a URL list lives

`auth.callbackUrls` is the list Cognito checks every sign-in redirect against. Two
things have to be true about it and they are true in different places:

- the **config file** is what a deploy reads, so the origins have to be in it
  before the auth stack builds the app client;
- the **running app client** is what Cognito actually checks, and a stage whose
  URL lists were saved after its last deploy would otherwise have a file saying
  one thing and a pool doing another.

So the step checks both and fixes both, and the write is the same one the
Checklist's save makes: the client is **read first**, because
`UpdateUserPoolClient` replaces every setting it is not given — calling it with
two URL lists alone would clear the client's auth flows, its scopes, its token
lifetimes and its identity providers, and the failure would arrive later as
"sign-in stopped working". The three apps and not four: `apps/demo` is a
third-party client of the content API and authenticates with an API token, so its
origin in this list would be a redirect Cognito accepts and no app ever asks for.

## The frontends

`startService` spawns `next dev -p <port>` in the app's own directory with these
in the process environment:

```
NEXT_PUBLIC_ACHAR_API_URL                 from AcharApiStack-<stage>
NEXT_PUBLIC_ACHAR_REGION                  from the environment's config
NEXT_PUBLIC_ACHAR_USER_POOL_ID            from AcharAuthStack-<stage>
NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID     from AcharAuthStack-<stage>
NEXT_PUBLIC_ACHAR_AUTH_DOMAIN             from AcharAuthStack-<stage>
```

**Nothing on disk is rewritten by a start.** `@next/env` fills in a key only when
`process.env` does not already have it, so an injected value wins over
`.env.local` and the file keeps saying exactly what it said. That is what makes it
safe to use while somebody is halfway through editing that file — and it is the
reason the deploy plan's step 9, which *does* write the files, is a separate and
visible thing.

Each dev server is spawned **detached**, in its own process group, because
`next dev` starts a compiler and workers underneath itself and killing only the
process the console holds leaves the rest holding the port. Stop kills the group.

### "Does it build" is the question a frontend has

There is **no cloud deploy target for a frontend here**, and that is deliberately
not built — see *What it will not do*. What a frontend can be asked is whether it
builds, so `/frontends/<app>` runs `next build` in the app's directory, as a
**tracked run**: three steps (the app's directory and the variables it will be
built with, the build itself, and what it produced), a transcript, and a Stop that
reaches the compiler. It goes through the same engine a deploy does, because a
second place where a reload loses a running job is a second place to fix.

### The console does not start itself

`apps/console` is one of the four apps and it is listed with the others, because a
list of "the apps in this workspace" that quietly left out the one you are looking
at would be a list somebody has to discover the shape of. Its **Start is
refused**, with a sentence: port 3002 is the process answering the request, and
starting it again would be a second `next dev` on a port the first one holds —
exiting with EADDRINUSE a second later, which the console would then have to
report as its own copy failing at something it is already doing.

## Deleting an environment

The Deployments tab is also where an environment is deleted from, at the bottom,
below everything that is about the run you came for. It destroys the five
CloudFormation stacks **and** removes `infra/config/achar-<stage>.json`, which is
the file that makes the stage an environment in this console at all — so the row
goes with it. The deletion is a tracked file, so it is yours to commit.

**The data is a tick.** Every stateful resource here is `RemovalPolicy.RETAIN`, so
`cdk destroy` on its own stops at the stacks and leaves ten tables, both buckets,
the distribution, the user pool and every log group in AWS with nobody managing
them. Those orphans are not inert: they are what stops a redeploy of the same name
at early validation, and they are what an environment nobody can deploy to is
still paying for. Deleting a stage's only copy of its content is a different act
from deleting the environment — the projects and the documents do not come back —
so it is a checkbox in the confirmation rather than the whole of the delete:

- **Unticked (the default)**: the five-step plan. The stacks and the config file
  go, the data stays, and the run's last step reads back what is still there and
  what a redeploy of the same name will hit.
- **Ticked**: the eleven-step plan. Seven more steps delete everything the
  environment stood on, and the last step reports what it could not take with it.

Which one ran is legible afterwards from the run itself — the steps are in it, and
the page reads `data` out of them rather than remembering what was ticked — so the
deleted-environment card says which of the two happened.

| What the tick adds | Where the names come from |
| --- | --- |
| The ten DynamoDB tables | the Data stack's `<TableId>Name` outputs, read before it went; `existing.tables` for a stage that imports them |
| Both S3 buckets, emptied first | the `AssetsBucketName` output, `existing.assetsBucket`, and the distribution's own log bucket by `acharmediastack-<stage>-` prefix |
| The CloudFront distribution | `existing.cloudFrontDistributionId`, or the `CloudFrontDistributionId` output — an id CloudFront assigned is written down nowhere else |
| The user pool, with every account in it | `existing.userPoolId`, or the auth stack's output |
| Every `/aws/lambda/achar-<stage>-*` log group | the account, by name rule — the deployed set is not readable by then, and a log group outlives the function that wrote to it |
| The Google client secret | `achar/<stage>/google-client-secret`, which is per stage and therefore safe to delete |

Two things are **reported rather than deleted** when the tick is set, and both are
in the run's own last step: a **shared** resource whose names another stage's
config carries — the run refuses before it starts — and anything the run could not
take with it. Alongside them, in both shapes, it names the apps whose `.env.local`
still reads the API URL that just went.

That is why deleting is a **run of five or eleven steps** rather than one
`cdk destroy` behind a button, and why the button asks for the stage's name rather
than a click. The steps are:

| # | Step | In which plan | What it is |
| --- | --- | --- | --- |
| 1 | This machine can act on the account | both | The deploy plan's own second step, shared — a delete in the wrong account deletes somebody else's environment |
| 2 | Nothing else stands on what this environment stands on | both | **Refuses**, before anything is destroyed, when another stage's config names the same table, bucket, distribution or pool: that resource is not this environment's to delete, and taking it would be another stage's content silently disappearing |
| 3 | The five stacks are destroyed | both | `cdk destroy --all --force` — `--force` because every process here has stdin on `ignore`, so CDK's confirmation would read an end-of-file. Skipped, with the reason, when there is nothing deployed. This is also where the names only a stack knows are read: `AssetsBucketName`, `CloudFrontDistributionId` and the pool id, out of the outputs, before the stacks that publish them go |
| 4 | No stack of this environment is left | both | The post-condition. A stack in `DELETE_FAILED` stops the run **before** the config file goes, because that is the case where the file is still worth having |
| 5 | The tables are gone | ticked | Every table of this environment, deleted and waited for — the CLI's own waiter, so the step ends when the table is gone rather than when the request was accepted |
| 6 | The media is gone | ticked | The distribution disabled, waited for and deleted; then both buckets, emptied and deleted. The order is forced: CloudFront will not delete an enabled distribution, and a bucket has to be empty before it can be deleted |
| 7 | The user pool is gone, with every account in it | ticked | Its own step because it is the one deletion that is about people: a redeploy of the same name makes a **new**, empty pool and everybody signs up again |
| 8 | The log groups are gone | ticked | One per function, thirty-nine of them, and the first thing that stops a redeploy of the same name |
| 9 | This environment's credentials are gone | ticked | The Google client secret. The leftover the Checklist would otherwise have to create again, and the reason a stage that comes back comes back from the Checklist rather than from what the last one left behind |
| 10 | What is still pointed here | ticked | **Reports instead of applying**: what the delete could not take with it, and the four apps' `.env.local` files compared against the `ApiUrl` captured before the stack publishing it went away |
| 10 | What is left behind, and what a redeploy of this name will hit | unticked | **Reports instead of applying** too, and reads the account rather than predicting it: how many tables, buckets and log groups are still there by name, the pool with how many accounts are in it, the distribution — and what each of them does to a redeploy of the same name |
| 11 | The environment's config file is removed | both | The last thing, and only once the stacks — and, when it was asked for, the data — are gone |

The reporting step in either plan is **satisfied by finding what it expected**: it
is a reading, not a decision. Pointing the frontends somewhere else is a decision
about this product rather than a step toward deleting this environment, and so is
whether the data should go — which is why the tick is asked *before* the run
rather than offered inside it. What that step read is also the run's result: a
delete's answer is not a URL but a list of lines, which the page draws where a
deploy draws its outputs.

## What it will not do

- **Deploy anything by itself.** There is no timer, no watcher and no
  post-install hook. The plan runs when the button is pressed, and never
  otherwise.
- **Deploy a frontend anywhere.** play pushes its two apps to Vercel; Achar has no
  equivalent, and a CDN integration was **deliberately left out** rather than
  stubbed. What that would need is a hosting account, a token, a project per app
  and a domain — none of which this repository has, and inventing a second
  deployment target inside the tool that exists to describe the first is how a
  control room acquires a second source of truth. What the console does instead is
  honest and local: it starts each app's `next dev`, hands it one environment's
  values, streams its output, and can run `next build` as a tracked step. When
  Achar gets a hosting target, this is the file that will say so.
- **Delete data it was not asked to delete.** The run destroys one stage's five
  stacks and removes its config file, after its name has been typed into the card
  — and the tables, the buckets, the pool and the log groups go only if the box
  beside that name was ticked, because a run that was not asked has no steps that
  could. It refuses to start when another stage's config names the same resources.
- **Deploy one environment twice at once.** A second request for a stage that is
  already deploying is refused by name: two `cdk deploy --all` runs against one
  set of stacks contend for the same resources, CloudFormation serialises them
  anyway, and the loser reports the other's half-finished state as a rollback.
  A *different* environment is a different set of stacks and deploys alongside it
  — see *Two environments at once* above for what that leaves shared.
- **Write to AWS outside the plan.** Every read on the state endpoint is a
  `describe`, a `list` or a `get-parameters`. The writes are three, all behind a
  button and none of them a deploy: the credential save (the config file, the
  Google client secret, and the app client's URL lists), the plan's own ninth and
  eleventh steps (the apps' `.env.local` files, and the origins Cognito accepts),
  and the destroy run. The plan's transcript shows the `cdk` and `aws` invocations
  it amounts to.
- **Survive its own dev server restarting.** The run and the service registry live
  on `globalThis`, so a hot reload keeps them. Restarting the console process
  stops the dev servers it started, rather than orphaning them; one that outlived
  its console another way — a `SIGKILL`, a crash — is adopted from the state file
  the console keeps about itself in the OS temporary directory, so it is shown
  rather than forgotten, and it is not killed by a console that did not start it.
- **Run with nothing deployed.** It has to, and it does. With no AWS credentials,
  no config file and no stacks the console still renders: the environment list
  saying "not deployed", the checklist saying what is missing, and the AWS page
  saying who the CLI is, or that there is no CLI. A control room that white-screens
  when the thing it controls is absent is useless precisely when it is needed.

## Why it shares no code with the apps

This app imports **no `@achar/*` package**, and `next.config.mjs` has no
`transpilePackages`. It draws with its own primitives in `src/components/ui/`, and
its own shapes in `src/lib/types.ts`.

The reason is the one thing about this app that is not a preference. Web and
studio draw with `@achar/ui` because they are the same product seen from two
sides; this is the room the operator stands in. **A tool that shares a component —
or a type, or a client — with the thing it deploys is a tool that cannot be used to
diagnose that thing.** If `apps/web` renders a broken document because
`@achar/schema` changed, the console has to be able to say so with code that did
not change with it. The same argument runs through every read: the console calls
`aws` rather than taking the SDK the handlers use, and it plans a deploy rather
than importing the CDK app that performs one.

The cost is real and accepted: a change to the palette is two edits, and
`lib/types.ts` restates shapes that `@achar/types` also declares. What it buys is
that this app's failures are its own.

## A note on the `@achar` entries in `package.json`

There are none, and that is on purpose — the same way play's console has none. The
dependencies are `next`, `react`, `react-dom`, `lucide-react` and Tailwind. There
is no `clsx`/`tailwind-merge` (the `cn` in `lib/cn.ts` is four lines and the merge
would never fire), no component library, no chart library and no AWS SDK.

## Where things are

```
src/server/
  repo.ts          the repository root, the four apps, the profile, the binaries
  exec.ts          running a process and turning its output into lines
  aws.ts           the AWS CLI as a function or two — every call is a read
  environments.ts  infra/config/achar-<stage>.json, and the stack outputs an app needs
  settings.ts      what a person supplies: the config file, the credentials, and
                   the app client's URL lists
  plan.ts          THE BACKEND PLANS, one per direction: the eleven steps a deploy
                   walks, and the eleven a delete walks
  tables.ts        the environment's DynamoDB tables: what they are, and a page of
                   what is in one — every call a read
  metrics.ts       CloudWatch's numbers for one function, with the quiet slots
                   filled in so the chart can show an idle hour
  logs.ts          the stage's functions, and one of their log groups
  backend.ts       what a deploy reads and produces, and what CloudFormation did
  run.ts           the run engine — steps, transcript, cancel, result — for a
                   deploy, a delete and a build
  run-api.ts       one step's transcript after the fact, and the live stream
  services.ts      the four dev servers, the build a frontend can be asked for,
                   and cleaning up after them
  frontends.ts     what one app is handed, for one stage

src/app/api/
  state            who we are, and what exists            (GET, cached 5s)
  plan             the checklist before it has run        (GET)
  deploy           start, read or cancel one environment's  (POST / GET / DELETE)
                   run — `?stage=` names it, because more
                   than one can be going
  deploy/destroy   delete one environment: its five        (POST)
                   stacks, and — if asked — its data
  deploy/runs      every backend run going right now        (GET)
                   — what the list of environments draws
                   its "deploying" from
  deploy/events    its transcript, as it happens            (SSE)
  deploy/transcript  one step's lines, after the fact       (GET)
  services         the four frontends                    (GET)
  services/[app]   start a dev server, or build one        (POST / DELETE)
  services/events  all four on one stream, the builds       (SSE)
                   included
  environments/[stage]/settings
                   one environment's credentials and      (GET / PUT)
                   mail settings — a draft until the
                   file exists, and the write that
                   creates it
  backends/[stage]/env
                   inputs and outputs                      (GET)
  backends/[stage]/deployments
                   CloudFormation's own history            (GET)
  backends/[stage]/logs
                   the stage's functions, or one's logs    (GET)
                   — `?minutes=` is the window and `?q=`
                   is a CloudWatch filter pattern
  backends/[stage]/metrics
                   one function's invocations, errors      (GET)
                   and p95 duration, bucketed
  backends/[stage]/tables
                   the stage's tables, or one table's      (GET)
                   shape and a page of its rows —
                   `?table=`, and the form's `attribute`,
                   `operator`, `value` and `type`
  frontends/[app]/env
                   what one app is handed, for one stage   (GET)

src/components/
  console/         the frame: the rail, the environment picker, the theme
  backends/        the list of environments, one environment's tabs, and the
                   ones that are a file each because they are big enough to be:
                   the checklist of what it needs from a person, the tables it
                   reads, and its logs
  frontends/       the list, one app's page, and the environment picker both use
  integrations/    AWS
  deploy/          the checklist, the step rows, the transcript, the result, the
                   card an environment is deleted from, and the hook a run is
                   read through
  apps/            the service hook the frontend pages are built on
  settings/        the credentials form, the card Google has to be told about,
                   and the hook that loads it
  ui/              button, card, chip, field, tabs, picker, table, prose — the
                   design system, four files of which this app is the only user

src/lib/
  types.ts         every shape the server sends and a page draws
  backends.ts      a stage's words: its states, its blurbs, its five tabs
  frontends.ts     the same for the four apps
  format.ts        durations, times, sizes — every string a page formats
  dynamo.ts        DynamoDB's wire format, rendered for a person
  logs.ts          a Lambda log line, taken apart
  ranges.ts        the windows the console offers, and each one's bucket
  cn.ts            class-name joining
```

## Reading the transcript

The checklist and the transcript are one interface. Eleven rows say what the plan
will do and how far it has got; the pane underneath is the step you have open,
following the one being worked on until you click another — at which point it
stops following, because a pane that yanks itself away from what somebody is
reading is worse than one that is a line behind.

A finished run's lines are fetched a step at a time rather than replayed on every
page load, which is why opening the console after a deploy costs nothing.
