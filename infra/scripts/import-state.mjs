#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { TABLES } from '../src/generated/service.ts';

/**
 * Writes `infra/config/achar-<stage>.json` from a deployment that already exists.
 *
 * An environment the console creates writes its own config file, so this script
 * exists for the other case: an environment that was built by hand, or by an
 * earlier version of this app, whose physical resource names are sitting in
 * CloudFormation and nowhere else. Pointing the CDK app at them is what turns
 * "adopt these resources" from a person copying ARNs out of a console into one
 * command.
 *
 * **It writes `ownership` of all three groups as `false`**, because that is what
 * "import" means: CloudFormation will not change these resources and will not
 * delete them. Guessing `true` for a stage whose resources already exist would
 * ask CloudFormation to *create* a second copy of every table, which it would
 * then refuse to do by name — or worse, replace.
 *
 * It reads only. Every call below is `describe-stacks`, and the config file it
 * writes is the only thing it produces.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const INFRA_ROOT = path.resolve(HERE, '..');
const CONFIG_DIR = path.join(INFRA_ROOT, 'config');

function arg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find((entry) => entry.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const stage = arg('stage', 'dev');
const region = arg('region', process.env.AWS_REGION ?? 'us-east-1');
const profile = arg('profile', undefined);
const write = process.argv.includes('--write');

const awsArgs = ['--region', region];
if (profile) awsArgs.push('--profile', profile);

function aws(args) {
  try {
    return execFileSync('aws', [...args, ...awsArgs, '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (cause) {
    const stderr = cause.stderr ? String(cause.stderr).trim() : String(cause.message);
    throw new Error(`aws ${args.slice(0, 3).join(' ')} failed:\n${stderr}`);
  }
}

/** Every output of one stack, as a plain object. Empty when it is not deployed. */
function stackOutputs(name) {
  let parsed;
  try {
    parsed = JSON.parse(
      aws(['cloudformation', 'describe-stacks', '--stack-name', name, '--query', 'Stacks[0].Outputs']),
    );
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  return Object.fromEntries(parsed.map((entry) => [entry.OutputKey, entry.OutputValue]));
}

function main() {
  const account = JSON.parse(aws(['sts', 'get-caller-identity', '--query', 'Account']));

  const data = stackOutputs(`AcharDataStack-${stage}`);
  const media = stackOutputs(`AcharMediaStack-${stage}`);
  const auth = stackOutputs(`AcharAuthStack-${stage}`);

  console.log(`Account ${account}, region ${region}, stage ${stage}`);
  console.log(`  AcharDataStack-${stage}:  ${data ? 'found' : 'not deployed'}`);
  console.log(`  AcharMediaStack-${stage}: ${media ? 'found' : 'not deployed'}`);
  console.log(`  AcharAuthStack-${stage}:  ${auth ? 'found' : 'not deployed'}`);

  if (!data && !media && !auth) {
    throw new Error(
      `No Achar stacks for stage '${stage}' are deployed in ${account}/${region}, so there is ` +
        'nothing to import. A new environment is created by the console instead: npm run console.',
    );
  }

  // The Data stack publishes one `<TableId>Name` output per table, so the map is
  // built from the service table rather than from a list of output names written
  // out a second time here.
  const tables = {};
  const missing = [];

  for (const spec of TABLES) {
    const value = data?.[`${spec.id}Name`];
    if (value) tables[spec.id] = value;
    else missing.push(spec.id);
  }

  if (missing.length > 0) {
    console.warn(
      `\nWarning: ${missing.length} table output(s) missing — ${missing.join(', ')}. ` +
        'The config will import only what was found, and validation will refuse it until the ' +
        'rest are named.',
    );
  }

  const config = {
    stage,
    account,
    region,
    existing: {
      tables,
      assetsBucket: media?.AssetsBucketName ?? '',
      cloudFrontDistributionId: media?.CloudFrontDistributionId ?? '',
      cloudFrontDomain: media?.CloudFrontDomain ?? '',
      userPoolId: auth?.UserPoolId ?? '',
      userPoolClientId: auth?.UserPoolClientId ?? '',
      userPoolDomain: auth?.UserPoolDomain ?? '',
      googleSignInEnabled: auth?.GoogleSignInEnabled === 'true',
    },
    mail: {
      fromAddress: arg('from-address', 'no-reply@achar.example'),
      appBaseUrl: arg('app-url', 'http://localhost:3000'),
      studioBaseUrl: arg('studio-url', 'http://localhost:3001'),
      consoleBaseUrl: arg('console-url', 'http://localhost:3002'),
    },
    auth: {
      googleClientId: arg('google-client-id', ''),
      callbackUrls: [
        'http://localhost:3000',
        'http://localhost:3000/auth/callback',
        'http://localhost:3001',
        'http://localhost:3001/auth/callback',
      ],
      logoutUrls: ['http://localhost:3000', 'http://localhost:3001'],
    },
    // False for all three: see this script's own note.
    ownership: { tables: false, media: false, auth: false },
  };

  const file = path.join(CONFIG_DIR, `achar-${stage}.json`);

  if (!write) {
    console.log(`\n--- ${file} (dry run; pass --write to save) ---`);
    console.log(JSON.stringify(config, null, 2));
    return;
  }

  if (fs.existsSync(file)) {
    const previous = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (previous.account !== account) {
      throw new Error(
        `${file} names account ${previous.account}, and this machine is acting on ${account}. ` +
          'Refusing to overwrite one environment\'s config with another account\'s resources.',
      );
    }
  }

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`\nWrote ${file}. It is a tracked file, so it is yours to commit.`);
}

main();
