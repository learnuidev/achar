# `infra/config` — one file per environment

`achar-<stage>.json` is what a deployment stands on. The CDK app reads it at synth
time; the console reads and writes it.

**A file here is what makes a stage an environment.** The console lists
environments by listing this directory, so deleting the file is what removes one
from the list — which is the last step of the destroy plan, and why the file is
tracked in git rather than generated into a temp directory.

## Who writes it

- **The console.** Saving an environment's settings writes this file, and on a
  stage that has none, the save *is* the creation. The form opens with a draft
  carrying the product's defaults under the stage's name, so the first save is a
  complete file rather than a half-filled one.
- **`scripts/import-state.mjs`.** For a stage whose resources already exist:
  it reads their physical names out of CloudFormation and writes a config that
  imports them.

## `ownership`

The one field worth understanding before editing anything:

```json
"ownership": { "tables": true, "media": true, "auth": true }
```

`true` means the stack **creates** that group — the tables, the assets bucket and
CDN, the user pool. This is a new environment, and it is what the console writes.

`false` means the stack **imports** it by physical name from the `existing` block.
An imported resource is unmanaged: CloudFormation will not change it and will not
delete it.

**All `true` is the default.** A config that omits the field is read as all-`true`,
because a config written without it is a new environment. `false` is for a stage
that predates this CDK app and holds the product — it is never something to copy
into a new stage, because a stage that copies it inherits somebody else's data.

When any group is `false`, the matching names in `existing` are **required**, and
`loadConfig` refuses the file by name if one is missing rather than letting it
become a table name of `undefined` in thirty-eight Lambdas.

## What is in it

| Field | What it is |
| --- | --- |
| `stage`, `account`, `region` | Which stage, and the account and region it deploys into. The console refuses a config whose `account` does not match `sts get-caller-identity` |
| `ownership` | See above |
| `existing` | The physical names of what is imported. Required exactly to the extent `ownership` says something is |
| `assetsBucketName` | Optional, and only for a stage that **creates** its media. Absent is better — an S3 bucket name is unique across every AWS account, so a chosen one may already be somebody else's |
| `mail.fromAddress` | Who invitations would come from |
| `mail.appBaseUrl`, `mail.studioBaseUrl`, `mail.consoleBaseUrl` | The apps' own origins. What the API's CORS allows, what the bucket's CORS allows, and what a deploy writes into the apps' `.env.local` |
| `auth.googleClientId` | The OAuth client. **Empty is a valid answer** — a pool with no Google provider is a perfectly good pool, and an environment can be deployed before anybody has registered a client |
| `auth.callbackUrls`, `auth.logoutUrls` | Where Cognito may send people. Must include each app's origin and its `/auth/callback` |
| `googleClientSecretName` | The *name* of the Secrets Manager secret holding the Google client secret. Never the secret |
| `translation.model` | Optional. The **Bedrock** model id that translates content — a foundation model in this region, or a cross-region inference profile (`us.…`). Absent means this stage does not translate, and the route answers 501 rather than guessing a model |

## What is deliberately not in it

**No secret ever.** The Google client secret lives in Secrets Manager, and this
file holds its name. The CloudFront and Stripe credentials that `play` keeps
parameters for have no equivalent here: Achar's assets are published content
served from an open CDN, so there is no signing key to manage — see the media
stack's own note for why. `translation.model` is a model *id* and not a credential
for the same reason: Bedrock is called with the Lambda's own IAM role.

**No model access.** Which models an account may invoke is granted in the Bedrock
console, not by a deploy — so a stage whose `translation.model` names a model nobody
has enabled fails at the first translation with the provider's own sentence about it.
That is the one step of setting translation up that a person does by hand.

## The file in this directory

`achar-dev.json` is a starting point, and two of its values are placeholders:

- `account` is `000000000000`. Replace it with your own, or let the console's
  Checklist write it — the plan's second step refuses a deploy whose config names
  an account this machine cannot act on.
- `auth.googleClientId` is empty, so no Google provider is created.

It has `ownership` all-`true`, so deploying it creates everything new and empty.
