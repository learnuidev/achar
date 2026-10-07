import type { AppKey, DeployEvent, ServiceEvent } from "@/lib/types";
import { appDefinition } from "@/server/repo";
import { backlog, currentRun, subscribe } from "@/server/run";
import { servicesBacklog, subscribeServices } from "@/server/services";

/**
 * Every frontend on one stream, and the build of one of them.
 *
 * The cards share a page, so they share a connection: four `EventSource`s to say
 * four things would be four reconnects to get wrong, and the backlog for a card
 * that has not started yet is empty anyway.
 *
 * ## Why `?app=` is a parameter
 *
 * The services half of this stream does not need one — it is the four apps and
 * all of them are on it. The **build** half does: a build is a run through the
 * shared engine, keyed by its app, and a stream that attached to whichever build
 * started last would draw one app's checklist under another app's name. So a
 * subscriber that is looking at one app names it, and a subscriber that is only
 * watching dev servers leaves it out.
 *
 * A run is attached to **when the stream opens**, which is why the page reopens
 * this stream after it starts a build: the alternative — polling for "has a run
 * appeared" — would lose the first lines of every build to the width of the poll.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

/** A build is a frontend run, and a frontend run is keyed by its app. */
const KIND = "frontend" as const;

/**
 * A run's event, in this stream's own vocabulary.
 *
 * The two shapes differ in exactly one place. A `DeployEvent`'s line says which
 * **step** wrote it; a `ServiceEvent`'s says which **app** it belongs to, because
 * this stream is about four apps rather than about one run. Nothing is lost that
 * a page cannot find again: the step a line belongs to is on the run the same
 * stream carries, and the line itself lands in the app's own output next to the
 * dev server's — which is where a build's lines belong, since a build is
 * something this app is doing.
 */
function asServiceEvent(event: DeployEvent, app: AppKey, runId: string): ServiceEvent {
  switch (event.type) {
    case "run":
      return { type: "run", run: event.run, at: event.at };
    case "step":
      return { type: "step", runId, step: event.step, at: event.at };
    case "end":
      return { type: "end", run: event.run, at: event.at };
    case "log":
      return { type: "log", app, line: event.line };
  }
}

export async function GET(request: Request) {
  const wanted = new URL(request.url).searchParams.get("app");
  const app = wanted && appDefinition(wanted) ? (wanted as AppKey) : null;
  const run = app ? currentRun(KIND, app) : null;

  const encoder = new TextEncoder();
  let unsubscribeServices = () => {};
  let unsubscribeRun = () => {};
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          closed = true;
        }
      };

      const send = (event: ServiceEvent) => write(`data: ${JSON.stringify(event)}\n\n`);

      for (const event of servicesBacklog()) send(event);
      unsubscribeServices = subscribeServices(send);

      if (app && run) {
        for (const event of backlog(KIND, app, run.id)) {
          // Lines only for a build that is going: a finished one's transcript is
          // a step's own fetch away, and replaying ten minutes of compiler output
          // on every page load is a megabyte spent to draw a collapsed row.
          if (event.type === "log" && run.status !== "running") continue;
          send(asServiceEvent(event, app, run.id));
        }
        if (run.status === "running") {
          unsubscribeRun = subscribe(KIND, app, run.id, (event) =>
            send(asServiceEvent(event, app, run.id)),
          );
        }
      }

      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);

      request.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribeServices();
        unsubscribeRun();
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      closed = true;
      unsubscribeServices();
      unsubscribeRun();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
