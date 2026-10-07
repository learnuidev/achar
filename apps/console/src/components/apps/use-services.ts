"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { AppKey, LogLine, RunView, ServiceEvent, ServiceView } from "@/lib/types";

/**
 * The four frontends, as the page sees them — and the build of one of them.
 *
 * One `EventSource` for all four, because they share a page and a stream per
 * card would be four reconnects to get wrong. Lines are buffered and flushed on
 * an animation frame for the same reason a deploy's are: `next dev` prints a
 * burst on boot and a build prints hundreds while it compiles, and one render per
 * line is a card that stutters exactly when there is something to read.
 *
 * ## Why it takes an app
 *
 * The dev servers do not need one — every card gets every status. A **build** is
 * a run through the shared engine, keyed by its app, and the stream attaches to
 * the run that exists when it opens; so a page about one app names it, and the
 * list of all four leaves it out. `?app=` is the whole of the difference.
 *
 * ## Why the mirror is rebuilt when the stream says `services`
 *
 * The server's first event is always the backlog, and a subscriber gets the
 * dev servers' lines and — when an app was named — the build's. That event is
 * what says a connection has just opened, and this is the one place that knows
 * it, so the mirror is thrown away and refilled from the replay. Without it,
 * reopening the stream to follow a build (which is *exactly* when a page
 * reconnects) would show every line in the output twice.
 */

export interface ServicesState {
  services: ServiceView[];
  /** Ports something else is already listening on. */
  occupied: number[];
  lines: Map<AppKey, LogLine[]>;
  pending: AppKey | null;
  error: string | null;
  /** The build of the app this hook was opened for, or null when there is none. */
  run: RunView | null;
  dismissError: () => void;
  start: (app: AppKey, stage: string | null) => Promise<void>;
  stop: (app: AppKey) => Promise<void>;
  build: (app: AppKey, stage: string) => Promise<void>;
  cancelBuild: (app: AppKey) => Promise<void>;
  refresh: () => void;
}

/**
 * The same window the server keeps.
 *
 * Two different numbers would drift: the server would drop a line the mirror
 * still held, and the two would disagree about what the output said.
 */
const MAX_LINES = 400;

/**
 * The one app whose Start and Stop are refused.
 *
 * Mirrored from `CONSOLE_APP` in `server/repo.ts` because a client component
 * cannot import that module — it reads the filesystem to find the repository
 * root. The server is still the side that refuses; this is what lets a card say
 * *why* instead of rendering a button whose only outcome is a 409.
 */
export const SELF_APP: AppKey = "console";

export function useServices(app?: AppKey): ServicesState {
  const [services, setServices] = useState<ServiceView[]>([]);
  const [occupied, setOccupied] = useState<number[]>([]);
  const [lines, setLines] = useState<Map<AppKey, LogLine[]>>(new Map());
  const [pending, setPending] = useState<AppKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunView | null>(null);

  const buffer = useRef<Array<{ app: AppKey; line: LogLine }>>([]);
  const frame = useRef<number | null>(null);
  const source = useRef<EventSource | null>(null);

  // A string rather than the `app` itself, so the effect below has one stable
  // dependency whether or not a page named one.
  const stream = app ? `/api/services/events?app=${app}` : "/api/services/events";

  const flush = useCallback(() => {
    frame.current = null;
    if (buffer.current.length === 0) return;
    const incoming = buffer.current;
    buffer.current = [];
    setLines((current) => {
      const next = new Map(current);
      for (const { app: which, line } of incoming) {
        const existing = next.get(which);
        const merged = existing ? [...existing, line] : [line];
        next.set(which, merged.length > MAX_LINES ? merged.slice(merged.length - MAX_LINES) : merged);
      }
      return next;
    });
  }, []);

  const push = useCallback(
    (which: AppKey, line: LogLine) => {
      buffer.current.push({ app: which, line });
      if (frame.current === null) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const upsert = useCallback((service: ServiceView) => {
    setServices((current) => {
      const index = current.findIndex((candidate) => candidate.app === service.app);
      if (index === -1) return [...current, service];
      const next = [...current];
      next[index] = service;
      return next;
    });
  }, []);

  /**
   * (Re)opening the stream is not only a mount-time thing.
   *
   * The server subscribes a connection to the run that exists when it *connects*,
   * and a page that has just loaded has none. So a build started from this page
   * has to open a new connection to be followed — the `POST` answers with the
   * run, and everything after it arrives on a stream that is now attached to
   * something.
   */
  const open = useCallback(() => {
    source.current?.close();
    const events = new EventSource(stream);

    events.onmessage = (message) => {
      let event: ServiceEvent;
      try {
        event = JSON.parse(message.data) as ServiceEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "services":
          // A fresh connection: the replay that follows is the whole of what
          // this mirror should hold.
          buffer.current = [];
          setLines(new Map());
          setServices(event.services);
          break;
        case "status":
          upsert(event.service);
          break;
        case "log":
          push(event.app, event.line);
          break;
        case "run":
        case "end":
          setRun(event.run);
          break;
        case "step":
          setRun((current) =>
            current
              ? {
                  ...current,
                  steps: current.steps.map((step) =>
                    step.id === event.step.id ? event.step : step,
                  ),
                }
              : current,
          );
          break;
        default:
          break;
      }
    };

    events.onerror = () => {
      if (events.readyState === EventSource.CLOSED) {
        setError("The console lost its connection to the server. Refresh the page.");
      }
    };

    source.current = events;
  }, [push, stream, upsert]);

  useEffect(() => {
    open();
    return () => {
      source.current?.close();
      source.current = null;
    };
  }, [open]);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const response = await fetch("/api/services", { cache: "no-store" });
        if (!response.ok) return;
        const body = (await response.json()) as { services: ServiceView[]; occupied: number[] };
        setServices(body.services);
        setOccupied(body.occupied);
      } catch {
        // The stream is the source of truth; this only adds the port check.
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 20_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const start = useCallback(
    async (which: AppKey, stage: string | null) => {
      setPending(which);
      setError(null);
      setLines((current) => new Map(current).set(which, []));
      try {
        const response = await fetch(`/api/services/${which}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage }),
        });
        const body = (await response.json()) as { service?: ServiceView; error?: string };
        if (!response.ok) {
          setError(body.error ?? `HTTP ${response.status}`);
          return;
        }
        if (body.service) upsert(body.service);
        refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPending(null);
      }
    },
    [refresh, upsert],
  );

  const build = useCallback(
    async (which: AppKey, stage: string) => {
      setPending(which);
      setError(null);
      try {
        const response = await fetch(`/api/services/${which}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "build", stage }),
        });
        const body = (await response.json()) as { run?: RunView; error?: string };
        if (!response.ok) {
          setError(body.error ?? `HTTP ${response.status}`);
          return;
        }
        if (body.run) setRun(body.run);
        open();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPending(null);
      }
    },
    [open],
  );

  /**
   * Stop, and cancel a build — one request, because they are one request on the
   * server too: `DELETE /api/services/<app>` takes the build if one is going and
   * the dev server otherwise. They are named twice because the two buttons mean
   * different things to the person pressing them, and a hook that offered only
   * `stop` would make the Build tab's button a thing somebody has to read the
   * route to understand.
   */
  const remove = useCallback(
    async (which: AppKey) => {
      setPending(which);
      try {
        const response = await fetch(`/api/services/${which}`, { method: "DELETE" });
        const body = (await response.json()) as {
          service?: ServiceView;
          run?: RunView;
          error?: string;
        };
        if (!response.ok) {
          setError(body.error ?? `HTTP ${response.status}`);
          return;
        }
        if (body.service) upsert(body.service);
        if (body.run) setRun(body.run);
        refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setPending(null);
      }
    },
    [refresh, upsert],
  );

  return {
    services,
    occupied,
    lines,
    pending,
    error,
    run,
    dismissError: () => setError(null),
    start,
    stop: remove,
    build,
    cancelBuild: remove,
    refresh,
  };
}
