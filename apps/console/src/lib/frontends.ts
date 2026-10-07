import type { Tone } from "@/components/ui/chip";
import type { AppKey, ServiceStatus } from "@/lib/types";

/**
 * The four frontends, named once.
 *
 * Not a second source of truth about the apps — `APPS` in `server/repo.ts` is
 * what starts them and what says which port each one binds. This is the half a
 * *page* needs before the stream has said anything: the list is drawn from here
 * so all four exist on screen from the first paint, and a URL can name one of
 * them before a request has been made. Everything that is a fact about a running
 * process — its port, its blurb, its state — still comes from the server.
 *
 * **The console is one of the four**, and it is the only one whose Start is
 * refused: see `server/services.ts`. It is listed because a list of "the apps in
 * this workspace" that quietly left out the one you are looking at would be a
 * list somebody has to discover the shape of.
 */
export interface FrontendChoice {
  value: AppKey;
  label: string;
  /** The one line a dropdown shows beside the name. */
  hint: string;
}

export const FRONTENDS: readonly FrontendChoice[] = [
  { value: "web", label: "Web", hint: ":3000 · public site" },
  { value: "studio", label: "Studio", hint: ":3001 · authoring" },
  { value: "console", label: "Console", hint: ":3002 · this app" },
  { value: "demo", label: "Demo", hint: ":3003 · third-party client" },
];

/** The one in a URL, or nothing — which a page turns into a 404. */
export function frontendOf(slug: string): FrontendChoice | undefined {
  return FRONTENDS.find((frontend) => frontend.value === slug);
}

/** Where one app's own page lives. */
export function frontendPath(app: AppKey): string {
  return `/frontends/${app}`;
}

/**
 * The words the console uses for a dev server, and the tone each one carries.
 *
 * `stopped` is the one that is not a verdict: a frontend nobody started is the
 * normal state of a frontend, not a failure.
 */
export const STATUS: Record<ServiceStatus, { tone: Tone; label: string }> = {
  stopped: { tone: "muted", label: "stopped" },
  starting: { tone: "run", label: "starting" },
  running: { tone: "ok", label: "running" },
  failed: { tone: "bad", label: "failed" },
};

/** A dev server that is up, or on its way — the two states that are "live". */
export function isLive(status: ServiceStatus): boolean {
  return status === "running" || status === "starting";
}
