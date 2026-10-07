import fs from "node:fs";
import path from "node:path";

import type { AppKey, ProfileSource } from "@/lib/types";

/**
 * Where everything is, found rather than counted.
 *
 * The console is *driven from* `apps/console` but its whole subject is the
 * repository above it: `infra/` for the stacks, `services/api` for the handlers,
 * and the four apps it starts. Every path here is derived from one root, so the
 * console does not care where Next put its working directory — `next dev` runs
 * with `cwd` set to this app, but a `next start` from somewhere else, or a test,
 * would not.
 */

/**
 * The marker that says "this is the repository root".
 *
 * `infra/src/generated/service.ts` rather than `package.json`: there are
 * `package.json` files all the way down, and the generated service table is the
 * one file that exists here and nowhere else.
 */
const ROOT_MARKER = path.join("infra", "src", "generated", "service.ts");

let cachedRoot: string | null = null;

export function repoRoot(): string {
  if (cachedRoot) return cachedRoot;

  const from = process.env.ACHAR_REPO_ROOT
    ? path.resolve(process.env.ACHAR_REPO_ROOT)
    : process.cwd();

  let dir = from;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, ROOT_MARKER))) {
      cachedRoot = dir;
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  throw new Error(
    `Could not find the Achar repository root from '${from}': no ${ROOT_MARKER} above it. ` +
      "Set ACHAR_REPO_ROOT if the console is running outside the checkout.",
  );
}

export function repoPath(...parts: string[]): string {
  // `turbopackIgnore` is not an optimisation — it is the correct answer to a
  // question the bundler cannot answer correctly here. It sees a path built from
  // a runtime value and assumes the output might read *anything*, so it traces
  // the whole repository into the server bundle and says so on every build. This
  // app is never deployed: it runs from the checkout, and reading the checkout is
  // its entire job. Tracing it into its own output is a copy of the thing it is
  // reading, and the warning would be right about a hosted app and is wrong about
  // this one.
  return path.join(/* turbopackIgnore: true */ repoRoot(), ...parts);
}

/** The three apps the console starts, in the order they are shown. */
export interface AppDefinition {
  key: AppKey;
  name: string;
  blurb: string;
  port: number;
  /** The workspace package name, so `npm run dev --workspace` could drive it. */
  workspace: string;
}

/**
 * The three apps, and the port each one binds.
 *
 * The ports are not a preference: `apps/app` serves 3000 and `apps/demo` 3003,
 * because every one of their `dev` scripts and the callback
 * URLs in `infra/config/achar-<stage>.json` already name those numbers. This
 * list repeats them because a console that started an app on a port nobody's
 * Cognito client accepts would produce a sign-in that fails with
 * `redirect_uri_mismatch` — which names nothing in this repository.
 */
export const APPS: AppDefinition[] = [
  {
    key: "app",
    name: "App",
    blurb:
      "The site and the studio in one — the marketing front door at `/` and the content studio at `/studio`, on port 3000.",
    port: 3000,
    workspace: "achar-app",
  },
  {
    key: "console",
    name: "Console",
    blurb: "The control room — this app. It deploys the backend, starts the others, reads AWS.",
    port: 3002,
    workspace: "achar-console",
  },
  {
    key: "demo",
    name: "Demo",
    blurb: "Somebody else's client of the same content API — a leaf, on port 3003.",
    port: 3003,
    workspace: "achar-demo",
  },
];

/**
 * The one app whose Start is refused.
 *
 * `apps/console` is the process answering the request. Starting it again would
 * be a second `next dev` on a port the first one holds: it exits with EADDRINUSE
 * a second later, and the console would have to report its own copy failing at
 * something it is already doing. Named here rather than written into
 * `services.ts` so the refusal and the list agree about which app it is.
 */
export const CONSOLE_APP: AppKey = "console";

export function appDefinition(key: string): AppDefinition | undefined {
  return APPS.find((app) => app.key === key);
}

export function appDir(key: AppKey): string {
  return repoPath("apps", key);
}

/**
 * The `next` binary, resolved rather than shelled out to.
 *
 * `npx next` would be a second Node process spent deciding what to run, and
 * `npm run dev --workspace achar-app` cannot take a port without editing the
 * script. Next is hoisted to the root `node_modules` by the workspace install,
 * which is exactly where this looks.
 */
export function nextBin(): string {
  const candidates = [
    repoPath("node_modules", "next", "dist", "bin", "next"),
    repoPath("apps", "console", "node_modules", "next", "dist", "bin", "next"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Could not find the `next` binary. Run `npm install` at the repository root.");
  }
  return found;
}

/** The CDK CLI, from the workspace install — not a global one. */
export function cdkBin(): string {
  const candidates = [
    repoPath("node_modules", ".bin", "cdk"),
    repoPath("infra", "node_modules", ".bin", "cdk"),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error("Could not find the `cdk` binary. Run `npm install` at the repository root.");
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * The AWS profile
 * ------------------------------------------------------------------ */

export interface ProfileSetting {
  profile: string;
  source: ProfileSource;
}

/**
 * The profile the console reaches AWS with: whatever this process was started
 * with.
 *
 * There is deliberately **no file to read it from**, and that is a change from
 * the shape this console is modelled on rather than an omission. Achar has one
 * infrastructure config holding one account, and a console that resolved the
 * profile a second way — from a file, with a default — could deploy with
 * credentials nobody chose and say nothing about it. `AWS_PROFILE` in the
 * environment that started `npm run console` is the whole of the answer, and the
 * chrome shows it, so "which account am I about to act on" is on screen before
 * anything is pressed.
 */
export function profileSetting(): ProfileSetting {
  const fromEnv = process.env.AWS_PROFILE?.trim();
  if (fromEnv) return { profile: fromEnv, source: "AWS_PROFILE" };
  return { profile: "default", source: "default" };
}

export function defaultRegion(): string {
  return process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || "us-east-1";
}
