#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

import { FUNCTIONS, SERVICE_DEFAULTS } from '../src/generated/service.ts';

/**
 * Bundles every handler in the service table, once, ahead of synth.
 *
 * **Once, not per function.** `cdk synth` would otherwise invoke a bundler
 * thirty-nine times for one template, and `cdk deploy` again for the assets — so
 * the bundles are built here, written to `infra/dist/`, and referenced by the
 * stacks with `Code.fromAsset`. That is also what makes the console's deploy plan
 * able to ask "are the handlers current?" as a *check* rather than as a step: this
 * script compares what it would build against what it built last time and reports
 * nothing to do when they match.
 *
 * The service table is imported directly rather than parsed. Node runs the
 * TypeScript in `src/generated/service.ts` natively, and that file imports only
 * types from anywhere else, so importing it costs nothing and keeps this script
 * from having to know the table's shape a second time.
 *
 * ## What is external, and why only that
 *
 * `@aws-sdk/client-*` is left out of the bundles because the Node 22 Lambda
 * runtime ships AWS SDK v3 client packages. Everything else is bundled —
 * `@aws-sdk/lib-dynamodb` and `@aws-sdk/s3-request-presigner` among it, because
 * those are *utilities* rather than clients and are not part of the documented
 * runtime set. A bundle that carries its own copy of a small utility cannot be
 * broken by a runtime that stops shipping one; the clients are large enough that
 * duplicating them in thirty-nine places is worth avoiding.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(INFRA_ROOT, '..');
const SERVICE_DIR = path.join(REPO_ROOT, 'services', 'api');
const DIST_DIR = path.join(INFRA_ROOT, 'dist');
const MANIFEST = path.join(DIST_DIR, '.manifest.json');

const force = process.argv.includes('--force');

/**
 * The inputs a bundle depends on, hashed.
 *
 * Every handler's source plus every shared package's — not just the entry file —
 * because a change to `src/lib/access.ts` changes every bundle that imports it,
 * and a staleness check that only watched entry files would report "nothing to
 * do" for the one change that matters most.
 */
function inputsFingerprint() {
  const roots = [
    path.join(SERVICE_DIR, 'src'),
    path.join(REPO_ROOT, 'packages', 'schema', 'src'),
    path.join(REPO_ROOT, 'packages', 'types', 'src'),
  ];

  const hash = createHash('sha256');
  let files = 0;

  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;

    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx|json)$/.test(entry.name)) {
        hash.update(path.relative(REPO_ROOT, full));
        hash.update(fs.readFileSync(full));
        files += 1;
      }
    }
  };

  for (const root of roots) walk(root);

  return { fingerprint: hash.digest('hex'), files };
}

/** Where one handler's bundle goes, and the outfile esbuild writes. */
function outfileFor(entry) {
  if (!entry.startsWith('src/')) {
    throw new Error(`Handler entry must be relative to services/api, got '${entry}'`);
  }
  const directory = path.join(DIST_DIR, entry.replace(/\.ts$/, ''));
  return path.join(directory, 'index.js');
}

async function main() {
  const { fingerprint, files } = inputsFingerprint();

  const previous = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : null;

  if (!force && previous?.fingerprint === fingerprint) {
    const missing = FUNCTIONS.filter((spec) => !fs.existsSync(outfileFor(spec.entry)));
    if (missing.length === 0) {
      console.log(
        `Nothing to rebuild: ${FUNCTIONS.length} handlers are current with ${files} source files.`,
      );
      return;
    }
    console.log(`${missing.length} bundles are missing, so rebuilding.`);
  }

  // CDK never prunes an asset directory, and a bundle whose entry was renamed
  // leaves its old output behind — which is a stale handler still sitting in
  // `dist/` looking deployable.
  fs.rmSync(DIST_DIR, { recursive: true, force: true });

  const started = Date.now();
  let rebuilt = 0;

  for (const spec of FUNCTIONS) {
    const entryPoint = path.join(SERVICE_DIR, spec.entry);

    if (!fs.existsSync(entryPoint)) {
      throw new Error(
        `The service table names ${spec.entry} for '${spec.key}', and that file does not exist. ` +
          'The table is the list of what this API answers, so a missing file is a route that ' +
          'would deploy and then fail on its first request.',
      );
    }

    await esbuild.build({
      entryPoints: [entryPoint],
      outfile: outfileFor(spec.entry),
      bundle: true,
      platform: 'node',
      target: `node${SERVICE_DEFAULTS.runtime.replace('nodejs', '').split('.')[0]}`,
      // CommonJS because that is what Lambda's Node runtime loads for a
      // `index.handler` entry point without an ESM marker in the bundle.
      format: 'cjs',
      external: ['@aws-sdk/client-*'],
      sourcemap: true,
      // A bundle that minifies is a bundle whose stack traces name `a.b.c`.
      minify: false,
      logLevel: 'warning',
      metafile: true,
    });

    rebuilt += 1;
    process.stdout.write(`\rBundled ${rebuilt}/${FUNCTIONS.length} handlers…`);
  }

  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.writeFileSync(
    MANIFEST,
    `${JSON.stringify({ fingerprint, files, functions: FUNCTIONS.length, at: new Date().toISOString() }, null, 2)}\n`,
  );

  process.stdout.write('\r');
  console.log(
    `Bundled ${rebuilt} handlers from ${files} source files in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
  );
}

await main();
