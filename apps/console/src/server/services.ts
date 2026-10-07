import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import { duration, relative } from "@/lib/format";
import type { AppKey, LogLine, LogStream, ServiceEvent, ServiceView } from "@/lib/types";
import {
  FRONTEND_ENV_KEYS,
  frontendEnvPath,
  readFrontendEnv,
  stageOutputs,
  writeFrontendEnv,
  type StageOutputs,
} from "./environments";
import { display, lastMeaningfulLines, run, stripAnsi, type RunResult } from "./exec";
import type { CheckOutcome, PlanStep, StepContext } from "./plan";
import {
  APPS,
  appDefinition,
  appDir,
  CONSOLE_APP,
  defaultRegion,
  nextBin,
  profileSetting,
  repoRoot,
} from "./repo";

/**
 * The four frontends, started from here — and built from here.
 *
 * ## What "with a specific environment" means
 *
 * A Next app reads `NEXT_PUBLIC_*` from its `.env.local` **and** from the
 * environment it is started in — and the environment wins. `@next/env` fills in
 * only the keys `process.env` does not already have, which is the documented
 * behaviour and the property this whole feature rests on: the console can start
 * the studio against `staging` without touching `apps/studio/.env.local`, and
 * the file the developer has been editing keeps saying what it said.
 *
 * The values come from the same place the deploy plan's ninth step reads them
 * from, so a stage is *started* the same way it is *written down*.
 *
 * ## Why the process is detached
 *
 * `next dev` spawns a server, a compiler worker and — once a page with a
 * browser bundle is requested — more. Killing the process the console holds
 * would leave the rest of that tree holding the port, and the next start would
 * fail with `EADDRINUSE` for no reason anybody could see. Detached puts the tree
 * in its own process group, so one `kill(-pid)` takes all of it. The price is
 * that the console is responsible for cleaning up, which is what the exit
 * handlers at the bottom are for.
 *
 * ## The two halves of this file
 *
 * The store below is a **process** the console holds: a dev server, its output,
 * and the port it is on. The build plan at the end is the other thing the
 * console does with one of these apps, and it is deliberately not a process it
 * holds: it is a run through the shared engine, with steps and a transcript, so
 * that a build is drawn with the same checklist a deploy is. Nothing in the
 * build half imports `run.ts` — that file is what *starts* a run and it imports
 * this one for the plan, so the dependency only ever points one way.
 */

const MAX_LINES = 400;

/**
 * What this console has running, written down.
 *
 * A dev server is detached, so it outlives the process that started it — which
 * is the property that lets it keep its port and its compiler workers, and the
 * reason a console that was killed with `SIGKILL`, rebuilt, or simply restarted
 * would otherwise come back having forgotten three processes it is still
 * responsible for. The file is what makes "the console knows what it started" a
 * fact about the machine rather than about one Node process.
 *
 * It lives in the OS temporary directory, keyed by the repository, because it
 * describes processes on *this* machine: it is not configuration, it must not
 * be committed, and a clone in another directory is a different set of them.
 */
const STATE_FILE = path.join(
  os.tmpdir(),
  `achar-console-${createHash("sha1").update(repoRoot()).digest("hex").slice(0, 8)}.json`,
);

interface Service {
  view: ServiceView;
  lines: LogLine[];
  listeners: Set<(event: ServiceEvent) => void>;
  child: ChildProcess | null;
  /** Set once the dev server has printed its URL, so a later exit reads as a crash. */
  ready: boolean;
  seq: number;
}

interface Store {
  services: Map<AppKey, Service>;
  seq: number;
  /** On the store rather than in a module, so a hot reload cannot double up. */
  cleanupInstalled: boolean;
}

declare global {
  // eslint-disable-next-line no-var
  var __acharConsoleServices: Store | undefined;
}

const store: Store = (globalThis.__acharConsoleServices ??= {
  services: new Map(),
  seq: 0,
  cleanupInstalled: false,
});

interface Persisted {
  app: AppKey;
  pid: number;
  stage: string | null;
  apiUrl: string | null;
  startedAt: number;
  readyAt: number | null;
}

function writePersisted(): void {
  const entries: Persisted[] = [];
  for (const app of APPS) {
    const view = store.services.get(app.key)?.view;
    // Only a process that is actually somewhere is worth remembering: a row
    // that says "stopped" is the console's business, not the file's.
    if (!view || view.pid === null) continue;
    if (view.status !== "running" && view.status !== "starting") continue;
    entries.push({
      app: view.app,
      pid: view.pid,
      stage: view.stage,
      apiUrl: view.apiUrl,
      startedAt: view.startedAt ?? Date.now(),
      readyAt: view.readyAt,
    });
  }

  try {
    if (entries.length === 0) fs.rmSync(STATE_FILE, { force: true });
    else fs.writeFileSync(STATE_FILE, `${JSON.stringify(entries, null, 2)}\n`);
  } catch {
    // A console that cannot write its own scratch file still works; it just
    // forgets across restarts, which is where it started.
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Picks up processes an earlier console left running.
 *
 * Adopted, not restarted: the dev server is fine, it is the *console* that went
 * away. What cannot be recovered is its output — the pipes died with the process
 * that held them — so the card says so and offers the one thing that still
 * works, which is stopping it.
 *
 * It is also why the store is not the same thing as ownership. Next evaluates
 * this module in the compiler workers it forks, and those workers come and go
 * while the console is serving; one of them will find the state file and adopt
 * whatever the console running beside it has started. Reading about a process is
 * not holding it — see `installCleanup` — and a service this process holds the
 * child of is not an earlier session's at all.
 */
function reattach(): void {
  if (!fs.existsSync(STATE_FILE)) return;

  let entries: Persisted[];
  try {
    entries = JSON.parse(fs.readFileSync(STATE_FILE, "utf8")) as Persisted[];
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry?.pid || !alive(entry.pid)) continue;
    const service = serviceOf(entry.app);
    // Already ours. A hot reload re-evaluates this module inside the process
    // that started them, and re-adopting a service we are still holding would
    // put a note about a dead console on a card that is very much alive.
    if (service.child) continue;
    service.view = {
      ...service.view,
      status: "running",
      pid: entry.pid,
      stage: entry.stage,
      apiUrl: entry.apiUrl,
      startedAt: entry.startedAt,
      readyAt: entry.readyAt,
      error: null,
      adopted: true,
    };
    appendLine(
      service,
      "note",
      `adopted from an earlier console session (pid ${entry.pid}) — its output is no longer captured`,
    );
  }
}

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

function emptyService(app: AppKey): Service {
  const definition = appDefinition(app)!;
  return {
    view: {
      app,
      name: definition.name,
      blurb: definition.blurb,
      port: definition.port,
      url: `http://localhost:${definition.port}`,
      stage: null,
      status: "stopped",
      pid: null,
      startedAt: null,
      readyAt: null,
      exitCode: null,
      error: null,
      apiUrl: null,
      lineCount: 0,
      adopted: false,
    },
    lines: [],
    listeners: new Set(),
    child: null,
    ready: false,
    seq: 0,
  };
}

function serviceOf(app: AppKey): Service {
  let found = store.services.get(app);
  if (!found) {
    found = emptyService(app);
    store.services.set(app, found);
  }
  return found;
}

export function listServices(): ServiceView[] {
  return APPS.map((app) => serviceOf(app.key).view);
}

/**
 * One listener on all four services, and the backlog to go with it.
 *
 * The cards share a stream because they share a page: a subscriber that had to
 * open one EventSource per card would be four connections to say one thing, and
 * a card that appeared later would miss what was said before it.
 */
export function subscribeServices(
  listener: (event: ServiceEvent) => void,
): () => void {
  for (const app of APPS) serviceOf(app.key).listeners.add(listener);
  return () => {
    for (const app of APPS) serviceOf(app.key).listeners.delete(listener);
  };
}

export function servicesBacklog(): ServiceEvent[] {
  const events: ServiceEvent[] = [
    { type: "services", services: listServices(), at: Date.now() },
  ];
  for (const app of APPS) {
    const service = serviceOf(app.key);
    for (const line of service.lines) {
      events.push({ type: "log", app: app.key, line });
    }
  }
  return events;
}

function emit(service: Service, event: ServiceEvent): void {
  for (const listener of service.listeners) {
    try {
      listener(event);
    } catch {
      // A closed stream. The server removes it.
    }
  }
}

function emitService(service: Service): void {
  writePersisted();
  emit(service, { type: "status", service: service.view, at: Date.now() });
}

function appendLine(service: Service, stream: LogLine["stream"], text: string): void {
  store.seq += 1;
  const line: LogLine = { seq: store.seq, at: Date.now(), stream, text };
  service.lines.push(line);
  if (service.lines.length > MAX_LINES) {
    service.lines.splice(0, service.lines.length - MAX_LINES);
  }
  service.view.lineCount = service.lines.length;
  emit(service, { type: "log", app: service.view.app, line });
}

/* ------------------------------------------------------------------ *
 * Starting
 * ------------------------------------------------------------------ */

export interface StartServiceOptions {
  app: AppKey;
  /** `null` runs the app against whatever its own `.env.local` says. */
  stage: string | null;
  profile?: string;
  region?: string;
}

/**
 * The one app this console will not start or stop.
 *
 * `apps/console` on 3002 is the process answering the request that asked for the
 * start. A second `next dev` for it would race the port its own page holds, bind
 * nothing, and exit with `EADDRINUSE` a second later — and the console would then
 * have to report, as a failure, a copy of something that is at that moment
 * demonstrably working. Stopping it is refused for the same reason plus one:
 * the Stop would kill the process that has to answer with whether it stopped.
 *
 * Refused rather than quietly left out of the list, because the four apps are a
 * list of what is in this workspace and a list that omitted the one you are
 * looking at is a list you have to discover the shape of.
 */
function refuseConsole(action: "start" | "stop"): never {
  throw Object.assign(
    new Error(
      action === "start"
        ? "The console is the app you are looking at: apps/console is already serving this page on port 3002, and a second `next dev` for it would die on the port its own page holds. Start one of the other three — to run the console itself, use the terminal it was started from."
        : "The console cannot stop itself: this page is being served by the process a Stop would kill, so the answer would never arrive. Close the terminal it was started from.",
    ),
    { status: 409 },
  );
}

export async function startService(options: StartServiceOptions): Promise<ServiceView> {
  const { app, stage } = options;
  if (app === CONSOLE_APP) refuseConsole("start");

  const service = serviceOf(app);
  const definition = appDefinition(app)!;

  if (service.view.status === "running" || service.view.status === "starting") {
    return service.view;
  }

  const profile = options.profile ?? profileSetting().profile;
  const region = options.region ?? defaultRegion();

  // Asked here rather than by the route that calls this, because it is the same
  // question the refusal above answered — *may this start at all* — and the
  // console's own port would look busy for the right reason. `portInUse` and not
  // a bind attempt: see the note on `isListening`.
  if (await portInUse(definition.port)) {
    throw Object.assign(
      new Error(
        `Port ${definition.port} is already in use by something the console did not start. Free it, then try again.`,
      ),
      { status: 409 },
    );
  }

  let overrides: Record<string, string> = {};
  let apiUrl: string | null = null;

  if (stage) {
    const outputs = await stageOutputs(stage, { profile, region });
    if (!outputs.apiUrl) {
      throw new Error(
        `'${stage}' has no ApiUrl output, so there is nothing to point ${definition.name} at. ` +
          "Deploy that environment first.",
      );
    }
    overrides = { ...outputs.env };
    apiUrl = outputs.apiUrl;
  }

  service.lines = [];
  service.seq = 0;
  service.ready = false;
  service.view = {
    ...service.view,
    status: "starting",
    stage,
    pid: null,
    startedAt: Date.now(),
    readyAt: null,
    exitCode: null,
    error: null,
    apiUrl,
    lineCount: 0,
    adopted: false,
  };
  emitService(service);

  appendLine(
    service,
    "note",
    stage
      ? `starting ${definition.name} against '${stage}'${apiUrl ? ` — ${apiUrl}` : ""}`
      : `starting ${definition.name} against its own .env.local`,
  );

  const args = ["dev", "-p", String(definition.port)];

  const child = spawn(process.execPath, [nextBin(), ...args], {
    cwd: appDir(app),
    env: {
      ...process.env,
      // Above `.env.local` on purpose — see the note at the top of this file.
      ...overrides,
      // `next dev` is happy to open a browser; a console that steals focus every
      // time a card is clicked is not a console anybody keeps open.
      BROWSER: "none",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  service.child = child;
  service.view.pid = child.pid ?? null;
  emitService(service);

  const pending = { out: "", err: "" };

  function consume(stream: "out" | "err", chunk: string) {
    pending[stream] += chunk;
    const parts = pending[stream].split("\n");
    pending[stream] = parts.pop() ?? "";
    for (const part of parts) {
      const carriage = part.lastIndexOf("\r");
      const text = stripAnsi(carriage === -1 ? part : part.slice(carriage + 1)).replace(/\s+$/, "");
      appendLine(service, stream === "out" ? "out" : "err", text);

      // `✓ Ready in 2.1s` and `- Local: http://localhost:3000` are the two lines
      // Next prints when it is actually serving. The URL is the better signal:
      // it is printed after the port is bound.
      if (!service.ready && /Local:\s+http:\/\/localhost:\d+/.test(text)) {
        service.ready = true;
        service.view.status = "running";
        service.view.readyAt = Date.now();
        emitService(service);
      }
    }
  }

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => consume("out", chunk));
  child.stderr?.on("data", (chunk: string) => consume("err", chunk));

  child.on("error", (error) => {
    service.view.status = "failed";
    service.view.error = error.message;
    appendLine(service, "err", error.message);
    emitService(service);
  });

  child.on("close", (code) => {
    const wasReady = service.ready;
    service.child = null;
    service.ready = false;
    service.view.pid = null;
    service.view.exitCode = code;
    service.view.status = code === 0 || code === null ? "stopped" : "failed";
    if (service.view.status === "failed" && !service.view.error) {
      service.view.error = wasReady
        ? `the dev server exited with code ${code}`
        : `the dev server exited with code ${code} before it was serving`;
    }
    appendLine(service, "note", `stopped (exit ${code ?? "signal"})`);
    emitService(service);
  });

  return service.view;
}

/* ------------------------------------------------------------------ *
 * Stopping
 * ------------------------------------------------------------------ */

export function stopService(app: AppKey): ServiceView {
  if (app === CONSOLE_APP) refuseConsole("stop");

  const service = serviceOf(app);
  killService(service, "SIGTERM");

  if (!service.child) {
    // An adopted service has no `close` event coming: the pipe that would have
    // carried it died with the console that opened it. Saying it is stopped is
    // the honest answer — and if the process somehow survived, the card's port
    // check says so on the next read.
    service.view = {
      ...service.view,
      status: "stopped",
      pid: null,
      readyAt: null,
      error: null,
      adopted: false,
    };
    emitService(service);
  }

  return service.view;
}

function killService(service: Service, signal: NodeJS.Signals): void {
  // The view's pid, not the child's: a service adopted from an earlier console
  // session has no child here and is still ours to stop.
  const pid = service.child?.pid ?? service.view.pid;
  if (!pid) return;
  try {
    // Detached, so the child leads its own group and the negative pid reaches
    // every process `next dev` started underneath it.
    process.kill(-pid, signal);
  } catch {
    try {
      process.kill(pid, signal);
    } catch {
      // Already gone.
    }
  }
}

/* ------------------------------------------------------------------ *
 * Is the port already taken?
 * ------------------------------------------------------------------ */

/**
 * Whether something is listening on an app's port.
 *
 * Asked by **connecting**, not by trying to bind — and that is not a detail.
 * `next dev` binds the wildcard address, and on macOS a listener on `*:3000` and
 * a test bind of `127.0.0.1:3000` do not collide: the bind succeeds, the console
 * reports the port free, and the dev server it starts dies with `EADDRINUSE`
 * four lines of stack trace later. A connect answers the question that actually
 * matters — is somebody serving here — and answers it the same way the browser
 * will.
 *
 * Both stacks are tried, because a listener on one is invisible to the other
 * and the address `localhost` resolves to is not ours to decide.
 */
function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const settle = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.once("connect", () => settle(true));
    socket.once("timeout", () => settle(false));
    socket.once("error", () => settle(false));
  });
}

export async function portInUse(port: number): Promise<boolean> {
  const [v4, v6] = await Promise.all([
    isListening("127.0.0.1", port),
    isListening("::1", port),
  ]);
  return v4 || v6;
}

/**
 * Every app port something is listening on.
 *
 * The route subtracts the ports of services this console is holding, because a
 * dev server the console started is on its port for the right reason and saying
 * otherwise would put a warning on a card that is working.
 */
export async function occupiedPorts(): Promise<number[]> {
  const results = await Promise.all(
    APPS.map(async (app) => ((await portInUse(app.port)) ? app.port : null)),
  );
  return results.filter((port): port is number => port !== null);
}

/* ------------------------------------------------------------------ *
 * The build, as a run through the shared engine
 * ------------------------------------------------------------------ */

/**
 * One environment's outputs, read once for the whole run.
 *
 * All three steps below ask about the same environment, and the answer cannot
 * change under them: nobody deploys a stage in the four seconds between reading
 * its API URL and writing it into a file. Each read is five `describe-stacks`
 * calls, so it is read on the first step that needs it and the rest find it in
 * `ctx.data` — the same way the deploy plan's steps share what they learn.
 */
async function outputsFor(ctx: StepContext): Promise<StageOutputs> {
  const cached = ctx.data.outputs as StageOutputs | undefined;
  if (cached) return cached;

  const outputs = await stageOutputs(ctx.stage, { profile: ctx.profile, region: ctx.region });
  ctx.data.outputs = outputs;
  return outputs;
}

interface StepCommand {
  cwd?: string;
  /** Merged over the run's own environment — which is merged over this process's. */
  env?: Record<string, string>;
  timeoutMs?: number;
  /** Replaces the transcript line handler, for a step that reads its own output. */
  onLine?: (stream: LogStream, text: string) => void;
}

/**
 * A command a step runs, in the run's own environment.
 *
 * `run` rather than `spawn`, because a build's whole value is its output: every
 * line arrives in the step's transcript as it is printed, and the whole of it is
 * kept for the note a failure writes. The process is handed to the run through
 * `ctx.owns`, so Stop reaches it — a build nobody can cancel is a build that
 * holds the checkout for ten minutes while somebody waits to press the button
 * again.
 */
async function exec(
  ctx: StepContext,
  command: string,
  args: string[],
  options: StepCommand = {},
): Promise<RunResult> {
  ctx.log("note", `$ ${display(command, args)}`);

  return run(command, args, {
    cwd: options.cwd ?? ctx.root,
    env: {
      // The profile and the region are what the AWS CLI reads, and `STAGE` is
      // what this repository's own scripts read.
      AWS_PROFILE: ctx.profile,
      AWS_REGION: ctx.region,
      AWS_DEFAULT_REGION: ctx.region,
      STAGE: ctx.stage,
      ...options.env,
    },
    onLine: options.onLine ?? ctx.log,
    timeoutMs: options.timeoutMs,
    onSpawn: ctx.owns,
    detached: true,
  });
}

/**
 * A command that had to work, and the sentence when it did not.
 *
 * The last few lines rather than all of it: a failed build has already put its
 * error in the transcript above, and a note that repeated forty lines of it
 * would be a note nobody reads.
 */
function assertOk(result: RunResult, what: string, timeoutMs: number): void {
  if (result.timedOut) {
    throw new Error(
      `${what} did not finish within ${Math.round(timeoutMs / 60_000)} minutes and was stopped.`,
    );
  }
  if (result.code !== 0) {
    const lines = lastMeaningfulLines(result.stderr || result.stdout, 4);
    throw new Error(
      `${what} failed — ${lines.length > 0 ? lines.join(" · ") : "it said nothing before it exited"}`,
    );
  }
}

/**
 * What the last build of this app was, for the step that is about to replace it.
 *
 * It never answers `satisfied`, and that is the point: `next build` is what the
 * Build button is *for*, and a check that said "already built" would be a button
 * that does nothing. The artefact is read to be **reported** — its absence is the
 * difference between "nothing here has ever been built" and "the last build is
 * three hours old", which is the one thing the console knows about a build before
 * it starts one.
 */
function lastBuild(file: string, folder: string): CheckOutcome {
  let id: string | null = null;
  let at: number | null = null;
  try {
    id = fs.readFileSync(file, "utf8").trim() || null;
    at = fs.statSync(file).mtimeMs;
  } catch {
    // Never built here, which is an answer rather than a failure.
  }

  if (!id) return { satisfied: false, note: `nothing has been built in ${folder} yet` };
  if (at === null) return { satisfied: false, note: `the last build was ${id} — building again` };
  return {
    satisfied: false,
    note: `the last build was ${id}, ${relative(at, Date.now())} — building again`,
  };
}

interface BuildReport {
  /** Next's build id, or null when there is no build here to read. */
  id: string | null;
  apiUrl: string | null;
  /** Whether the URL above was found among the chunks the build emitted. */
  inlined: boolean;
}

function readBuildId(file: string): string | null {
  try {
    return fs.readFileSync(file, "utf8").trim() || null;
  } catch {
    return null;
  }
}

/**
 * Whether the bundles a build emitted carry a string.
 *
 * Only `.next/static` — the client's own chunks, which is where an inlined
 * `NEXT_PUBLIC_*` ends up and what a browser is actually handed; the server's
 * output is not what anybody downloads. Bounded on both axes on purpose: a build
 * of an app with a large dependency graph puts thousands of files there, and a
 * check that took ten seconds to answer a question nobody is watching for would
 * cost more than the answer is worth.
 */
function inBundles(dir: string, needle: string): boolean {
  const MAX_FILES = 400;
  const MAX_BYTES = 4_000_000;

  let files: string[];
  try {
    files = fs
      .readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((name) => name.endsWith(".js"));
  } catch {
    return false;
  }

  for (const name of files.slice(0, MAX_FILES)) {
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).size > MAX_BYTES) continue;
      if (fs.readFileSync(file, "utf8").includes(needle)) return true;
    } catch {
      // A file that went between the listing and the read is not an answer.
    }
  }
  return false;
}

function buildReportNote(report: BuildReport, stage: string): string {
  if (!report.id) return "nothing was built here, so there is nothing to read";
  if (!report.apiUrl) {
    return `build ${report.id} · '${stage}' publishes no ApiUrl, so there is no URL to look for`;
  }
  if (report.inlined) {
    return `build ${report.id} · ${report.apiUrl} is inlined in the chunks it emitted`;
  }
  return `build ${report.id} · no emitted chunk mentions ${report.apiUrl} — either this app reads the API URL only where a browser does not, or the build is not '${stage}'s`;
}

/**
 * The three steps of a `next build`, for one app against one environment.
 *
 * ## Why a plan and not a spinner
 *
 * "Does it build" is three questions, and only the middle one is the compiler.
 * The app has to be where the console thinks it is and its `.env.local` has to
 * say what the build will inline; the build itself takes a minute and can fail
 * in ways only its own output explains; and *succeeded* is not the same claim as
 * *is this environment's*. `NEXT_PUBLIC_*` is substituted while compiling, so a
 * build is the moment an environment stops being a variable and becomes a string
 * inside a file somebody downloads — which is exactly the thing a green tick
 * would hide.
 *
 * ## The command
 *
 * `next` is resolved by `nextBin()` and run with this Node, the same way the dev
 * servers above are started, so a build and a dev server of one app cannot end up
 * on two different Nodes. The environment's five variables go in the **process
 * environment** as well as in the file, and that is what makes the build honest:
 * `@next/env` fills in a key only when `process.env` does not already have it, so
 * the build is against the environment that was asked for whatever the file has
 * been edited to say.
 */
export function buildBuildPlan(app: AppKey, stage: string): PlanStep[] {
  const dir = appDir(app);
  const folder = path.relative(repoRoot(), dir);
  const envFile = path.relative(repoRoot(), frontendEnvPath(app));
  const buildIdFile = path.join(dir, ".next", "BUILD_ID");
  const clientDir = path.join(dir, ".next", "static");

  const BUILD_TIMEOUT = 30 * 60_000;

  /**
   * The app, and the file that says which environment it is.
   *
   * The check is worth having even though the build would work without it: a
   * file naming one environment beside an artefact built for another is the one
   * state in which reading either of them misleads, and after a build for
   * `staging` the file has to say `staging` or the next `next dev` quietly runs
   * against something else.
   *
   * **Only the five `NEXT_PUBLIC_ACHAR_*` keys are replaced** — `writeFrontendEnv`
   * keeps everything else, because everything else was put there by somebody
   * else.
   */
  const files: PlanStep = {
    id: "app",
    title: "The app is here, and its .env.local names this environment",
    detail: `\`${envFile}\` is read first and rewritten only when it disagrees with \`${stage}\`: a build inlines the values it is handed, so a file pointing somewhere else would be a file that denies the artefact sitting beside it. Only \`${FRONTEND_ENV_KEYS.join("`, `")}\` are replaced — anything else in the file was put there by somebody else and cannot be derived here.`,
    satisfiedLabel: "In step",
    timeoutMs: 5 * 60_000,
    // One file per app, and it names one environment: two runs writing it at
    // once would interleave a key from each. The deploy plan's ninth step writes
    // the same four files under the same lock.
    lock: "checkout",
    check: async (ctx) => {
      if (!fs.existsSync(path.join(dir, "package.json"))) {
        return {
          satisfied: false,
          note: `no package.json in ${folder} — there is no app here to build`,
        };
      }

      const outputs = await outputsFor(ctx);
      if (!outputs.apiUrl) {
        return {
          satisfied: false,
          note: `'${ctx.stage}' has published no ApiUrl, so there is nothing to point ${folder} at`,
        };
      }

      const file = readFrontendEnv(app);
      const differing = FRONTEND_ENV_KEYS.filter(
        (key) => (file[key] ?? "") !== (outputs.env[key] ?? ""),
      );
      if (differing.length === 0) {
        return {
          satisfied: true,
          note: `${envFile} already reads '${ctx.stage}' — ${outputs.apiUrl}`,
        };
      }
      return {
        satisfied: false,
        note: `${differing.join(", ")} ${differing.length === 1 ? "is" : "are"} not what '${ctx.stage}' says`,
      };
    },
    apply: async (ctx) => {
      const outputs = await outputsFor(ctx);
      if (!outputs.apiUrl) {
        // Deliberately not written. The five keys are written together, and an
        // environment with no API URL yet would have this run *remove* the URL
        // and the pool from a file somebody may well be using — turning a build
        // that only meant to check compilation into a broken `.env.local`.
        return {
          status: "skipped",
          note: `left ${envFile} alone — '${ctx.stage}' has no ApiUrl to write`,
        };
      }

      const written = writeFrontendEnv(app, outputs.env);
      ctx.log("out", `${path.relative(ctx.root, written)} — ${FRONTEND_ENV_KEYS.length} keys`);
      return { note: `wrote ${envFile} for '${ctx.stage}' · ${outputs.apiUrl}` };
    },
  };

  /**
   * The build itself.
   *
   * No lock, and that is a decision rather than an omission: this step holds the
   * checkout's lock for as long as the compiler runs, and a bundle step of a
   * deploy waiting two minutes behind somebody's build would be a deploy held up
   * by a question that does not touch `infra/dist`. What a build writes is
   * `apps/<app>/.next`, which belongs to this app and nothing else — and two
   * builds of one app are already impossible, because a run is keyed by its app.
   */
  const build: PlanStep = {
    id: "build",
    title: "`next build` succeeds",
    detail: `\`next build\` in \`${folder}\`, with '${stage}'s variables in the process environment as well as in the file — \`@next/env\` fills a key only when \`process.env\` does not already have it, so the build is against this environment whatever the file says. \`NEXT_PUBLIC_*\` is inlined while compiling, which makes this the step where an environment becomes a string inside a file a browser downloads.`,
    timeoutMs: BUILD_TIMEOUT,
    // No `satisfiedLabel`: this check never answers `satisfied` — a step that
    // skipped itself because a build once succeeded would be a Build button that
    // does nothing.
    check: async () => lastBuild(buildIdFile, folder),
    apply: async (ctx) => {
      const outputs = await outputsFor(ctx);
      const startedAt = Date.now();

      // Next's own steady lines, read as they arrive, so the note beside the step
      // moves while the compiler works rather than sitting on "running" for two
      // minutes. A build that prints none of them simply reports nothing, which
      // is why this is a progress note and never a condition.
      const phases: Array<[RegExp, string]> = [
        [/Creating an optimized production build/i, "compiling"],
        [/Compiled successfully/i, "compiled"],
        [/Generating static pages|Finalizing page optimization|Collecting build traces/i, "writing the output"],
      ];

      const onLine = (stream: LogStream, text: string) => {
        ctx.log(stream, text);
        for (const [pattern, note] of phases) {
          if (pattern.test(text)) {
            ctx.progress(note);
            break;
          }
        }
      };

      const result = await exec(ctx, process.execPath, [nextBin(), "build"], {
        cwd: dir,
        env: outputs.env,
        timeoutMs: BUILD_TIMEOUT,
        onLine,
      });
      assertOk(result, "next build", BUILD_TIMEOUT);

      return { note: `built ${folder} against '${ctx.stage}' in ${duration(Date.now() - startedAt)}` };
    },
  };

  /**
   * The post-condition, and the only step that can tell the two claims apart.
   *
   * `next build` exiting zero says the app compiles. It does not say *which
   * environment* the compiler inlined, and that is the fact this run exists to
   * establish: the variables are substituted at build time, so "the build
   * succeeded" and "the build is `staging`'s" are two different sentences, and
   * the second one is answered by looking in the chunks the build emitted.
   *
   * It reads rather than asserts, and reports either way. An app may legitimately
   * read its API URL only on the server, where nothing a browser downloads
   * mentions it — so "not found" is evidence, and not proof of a mistake.
   */
  const report: PlanStep = {
    id: "result",
    title: "The build says which environment it is",
    detail: `The artefact the build wrote — \`${path.relative(repoRoot(), buildIdFile)}\` — and the client chunks beside it, searched for this environment's API URL. \`NEXT_PUBLIC_*\` is inlined while compiling, so a build that succeeded is not yet a build that is '${stage}'s.`,
    satisfiedLabel: "Built and readable",
    timeoutMs: 2 * 60_000,
    check: async (ctx) => {
      const outputs = await outputsFor(ctx);
      const id = readBuildId(buildIdFile);
      const report: BuildReport = {
        id,
        apiUrl: outputs.apiUrl,
        inlined:
          id !== null && outputs.apiUrl !== null
            ? inBundles(clientDir, outputs.apiUrl)
            : false,
      };
      return { satisfied: id !== null, note: buildReportNote(report, ctx.stage) };
    },
    apply: async (ctx) => {
      const id = readBuildId(buildIdFile);
      if (!id) {
        throw new Error(
          `\`next build\` finished without writing \`${folder}/.next/BUILD_ID\`, so there is no build here to report. ` +
            "A build that exits zero and leaves no build id is not a build — the transcript above is where it said what it did instead.",
        );
      }

      const outputs = await outputsFor(ctx);
      return {
        note: buildReportNote(
          {
            id,
            apiUrl: outputs.apiUrl,
            inlined: outputs.apiUrl !== null ? inBundles(clientDir, outputs.apiUrl) : false,
          },
          ctx.stage,
        ),
      };
    },
  };

  return [files, build, report];
}

/* ------------------------------------------------------------------ *
 * Leaving
 * ------------------------------------------------------------------ */

/**
 * The console does not outlive its children.
 *
 * A dev server whose parent died is a process nobody can name, holding a port
 * nobody can free and running against an environment nobody chose. These
 * handlers are the whole of the cleanup: `exit` is synchronous, which `kill` is,
 * so the last thing the console does is take its children with it.
 *
 * **Its children.** The store also holds services `reattach` found in the state
 * file, and those are not this process's to kill — which is not a nicety. Next
 * forks a compiler worker per compilation, that worker evaluates this module,
 * adopts what the state file lists, and exits moments later: a cleanup that
 * killed everything it had *read about* therefore took down the dev servers of
 * the console it was forked by. Start a second frontend and the first one died
 * with the worker that noticed it. The live child handle is what says a service
 * was started here, and it is the whole of the difference: a process is only
 * ever ours to kill if we are the one holding its pipes.
 */
export function installCleanup(): void {
  if (store.cleanupInstalled) return;
  store.cleanupInstalled = true;

  const cleanup = () => {
    for (const app of APPS) {
      const service = store.services.get(app.key);
      if (service?.child) killService(service, "SIGKILL");
    }
  };

  process.on("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(signal, () => {
      cleanup();
      process.exit(0);
    });
  }
}

// Whichever route is reached first installs the handlers and adopts whatever an
// earlier console session left running — which is the earliest moment either can
// matter.
installCleanup();
reattach();
