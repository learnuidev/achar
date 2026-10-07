#!/usr/bin/env node
/**
 * Seeds a deployment with Achar's own content, through the public API.
 *
 * ```
 * node services/api/scripts/seed.mjs --api-url https://… --token achar_… [--project-id proj_…] [--dataset production]
 * ```
 *
 * **Through the API rather than straight into DynamoDB**, because the seed is
 * then subject to everything a client is: the schema has to accept the
 * documents, the draft/publish pair has to be produced the way a studio produces
 * it, and the counters and revisions are the ones the API would have written.
 * A script that wrote rows directly would be a second implementation of the
 * model, and the first thing it would stop agreeing about is drafts.
 *
 * **Why this registers a resolver hook.** The packages ship TypeScript source and
 * no build — `@achar/schema` has no `dist/` — so the seed data can only be read
 * by importing `.ts`, which Node 26 does natively. What Node does *not* do is
 * resolve the extensionless relative imports the packages are written with
 * (`./seed`, `./authors`), because those are resolved by the app bundlers and by
 * `tsc` and by nothing else. Rather than add a build step for one script, or
 * duplicate 68 documents here, the two lookups this needs are registered below:
 * a `.ts` suffix, then `/index.ts`. Everything else resolves normally.
 *
 * The script is idempotent. Documents are written with `createOrReplace` and
 * then published, so running it twice leaves the same content rather than a
 * second copy of it.
 */

import { registerHooks } from 'node:module';
import { parseArgs } from 'node:util';

registerHooks({
  resolve(specifier, context, next) {
    if (!specifier.startsWith('.')) return next(specifier, context);
    try {
      return next(specifier, context);
    } catch (first) {
      for (const suffix of ['.ts', '/index.ts']) {
        try {
          return next(specifier + suffix, context);
        } catch {
          // The next suffix is the answer, or the first failure is.
        }
      }
      throw first;
    }
  },
});

const { defaultSchema, seedDocuments } = await import('../../../packages/schema/src/index.ts');

/** Documents per request. A batch is one round trip, and 40 mutations is comfortably inside a Lambda's. */
const DOCUMENTS_PER_BATCH = 20;

const { values } = parseArgs({
  options: {
    'api-url': { type: 'string' },
    token: { type: 'string' },
    'project-id': { type: 'string' },
    dataset: { type: 'string', default: 'production' },
    'project-name': { type: 'string', default: 'Achar' },
    visibility: { type: 'string', default: 'PUBLIC' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(
    'usage: node services/api/scripts/seed.mjs --api-url <url> --token <token> [--project-id <id>] [--dataset <name>]',
  );
  process.exit(0);
}

const apiUrl = (values['api-url'] ?? process.env.ACHAR_API_URL ?? '').replace(/\/+$/, '');
const token = values.token ?? process.env.ACHAR_TOKEN ?? '';

if (!apiUrl || !token) {
  console.error('--api-url and --token are required (or ACHAR_API_URL and ACHAR_TOKEN).');
  process.exit(2);
}

// The route table lives under `/v1`, and a URL that already ends there is the
// one a console prints — accepting both is cheaper than explaining which.
const base = apiUrl.endsWith('/v1') ? apiUrl : `${apiUrl}/v1`;

async function call(method, path, body) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = payload?.error ?? {};
    const failure = new Error(
      `${method} ${path} answered ${response.status} ${error.code ?? ''} — ${error.message ?? text}`,
    );
    failure.status = response.status;
    throw failure;
  }

  return payload;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const info = await call('GET', '/info');
  console.log(`Seeding ${info.service} ${info.version} (${info.stage}, ${info.region})`);

  const projectId = values['project-id'] ?? (await createProject());
  console.log(`Project ${projectId}`);

  const dataset = values.dataset;
  await createDataset(projectId, dataset);

  const schema = defaultSchema();
  await call('PUT', `/projects/${projectId}/datasets/${dataset}/schema`, { types: schema.types });
  console.log(`Schema: ${schema.types.length} types, revision ${schema.revision}`);

  const documents = seedDocuments();
  let published = 0;
  for (let index = 0; index < documents.length; index += DOCUMENTS_PER_BATCH) {
    const batch = documents.slice(index, index + DOCUMENTS_PER_BATCH);
    const answer = await call('POST', `/data/mutate/${projectId}/${dataset}`, {
      mutations: batch.flatMap((document) => [
        { createOrReplace: writable(document) },
        { publish: { id: document._id } },
      ]),
    });
    published += answer.results.filter((result) => result.operation === 'publish').length;
    console.log(`  ${Math.min(index + batch.length, documents.length)}/${documents.length} documents`);
  }

  console.log(`Done — ${published} documents published into ${projectId}/${dataset}`);
}

/**
 * A seed document as a mutation body.
 *
 * `_rev`, `_createdAt` and `_updatedAt` are stripped rather than sent: the API
 * owns those, it refuses a field it would have to shadow, and a seeded row's
 * timestamps should be the moment it was written — the content carries its own
 * dates in `publishedAt` and the like.
 */
function writable(document) {
  const { _rev: _rev, _createdAt: _createdAt, _updatedAt: _updatedAt, ...fields } = document;
  return fields;
}

async function createProject() {
  const project = await call('POST', '/projects', {
    name: values['project-name'],
    organizationName: values['project-name'],
  });
  return project.projectId;
}

async function createDataset(projectId, dataset) {
  try {
    await call('POST', `/projects/${projectId}/datasets`, {
      datasetName: dataset,
      visibility: values.visibility,
    });
  } catch (error) {
    // A dataset that is already there is the state this script wants, and
    // re-running it is how somebody fixes a half-finished seed.
    if (error.status !== 409) throw error;
    console.log(`Dataset ${dataset} already exists`);
    return;
  }
  console.log(`Dataset ${dataset} created (${values.visibility})`);
}

try {
  await main();
} catch (error) {
  // One line, not a stack: the failures this script has are "the URL is wrong",
  // "the token is revoked" and "the schema was refused", and a handler's stack
  // trace tells the person running a seed nothing about any of them.
  console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
