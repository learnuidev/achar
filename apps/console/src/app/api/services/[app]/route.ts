import { NextResponse } from "next/server";

import type { AppKey } from "@/lib/types";
import { consoleDefaults, listStages } from "@/server/environments";
import { appDefinition } from "@/server/repo";
import { cancelRun, currentRun, isRunning, startBuild } from "@/server/run";
import { startService, stopService } from "@/server/services";

/**
 * Starting, stopping and building one frontend.
 *
 * `POST` does two things, and the body says which: **start** the dev server
 * (`{ stage }`, or nothing at all for "against its own `.env.local`"), or
 * **build** it (`{ action: "build", stage }`). They are one route because they
 * are one app — what differs is that a start is a process this console holds and
 * a build is a run through the shared engine, and the response says which of the
 * two came back rather than pretending they are one shape.
 *
 * `DELETE` stops the dev server, or cancels a build that is running.
 *
 * The stage is validated rather than trusted: it becomes a stack-name suffix on
 * the way to `describe-stacks`, and a stage nobody has a config for is a start
 * that fails with a sentence about the environment rather than one about a CLI.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A build is a frontend run, and a frontend run is keyed by its app. */
const KIND = "frontend" as const;

type Params = { params: Promise<{ app: string }> };

function resolveApp(value: string): AppKey | null {
  const definition = appDefinition(value);
  return definition ? definition.key : null;
}

/** A request body as a plain object, or an empty one when it is not one at all. */
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = (await request.json()) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    // An empty body is "start it against its own .env.local", which is the
    // default and not an error.
    return {};
  }
}

/** The two things a request may ask about one app, checked rather than trusted. */
function intentOf(body: Record<string, unknown>): { action: "start" | "build"; stage: string | null } {
  const action = body.action === "build" ? "build" : "start";
  const stage = typeof body.stage === "string" && body.stage.trim() ? body.stage.trim() : null;
  return { action, stage };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number }).status ?? 500;
  return NextResponse.json({ error: message }, { status });
}

/** A stage name, or the answer that refuses the request that named it. */
function stageRefusal(stage: string): NextResponse | null {
  if (!/^[a-z0-9][a-z0-9-]{0,30}$/.test(stage)) {
    return NextResponse.json(
      {
        error: `'${stage}' is not a stage name. Use lower-case letters, digits and dashes — it becomes a stack-name suffix and a config filename.`,
      },
      { status: 400 },
    );
  }
  if (!listStages().includes(stage)) {
    return NextResponse.json(
      {
        error: `No environment '${stage}' — there is no infra/config/achar-${stage}.json to read its stacks from.`,
      },
      { status: 404 },
    );
  }
  return null;
}

export async function POST(request: Request, { params }: Params) {
  const { app: slug } = await params;
  const app = resolveApp(slug);
  if (!app) {
    return NextResponse.json(
      { error: `'${slug}' is not one of the apps this console starts.` },
      { status: 404 },
    );
  }

  const { action, stage } = intentOf(await bodyOf(request));

  if (stage !== null) {
    const refusal = stageRefusal(stage);
    if (refusal) return refusal;
  }

  const { profile, region } = consoleDefaults();

  // A build is *against* an environment — its whole point is that the values get
  // inlined — so it is the one request that cannot leave the stage out.
  if (action === "build") {
    if (stage === null) {
      return NextResponse.json(
        {
          error:
            'A build is against an environment: give { action: "build", stage: "<stage>" }. Which stage it is decides the API URL the app is compiled with.',
        },
        { status: 400 },
      );
    }

    try {
      return NextResponse.json(
        { run: startBuild({ app, stage, profile, region }) },
        { status: 201 },
      );
    } catch (error) {
      return errorResponse(error);
    }
  }

  try {
    // Starting the console app is refused inside `startService`, rather than by
    // the port check that used to live here: port 3002 is busy *because* the page
    // asking is on it, and "something the console did not start" would be a
    // sentence about the wrong thing.
    return NextResponse.json(
      { service: await startService({ app, stage, profile, region }) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const { app: slug } = await params;
  const app = resolveApp(slug);
  if (!app) {
    return NextResponse.json(
      { error: `'${slug}' is not one of the apps this console starts.` },
      { status: 404 },
    );
  }

  // One button, two things it can be about. A build in flight goes first: it is
  // the one that cannot wait — it holds no port, nothing else will end it, and a
  // build of the app you are looking at is the reason you pressed Stop. The dev
  // server is still there, and the next press stops it.
  if (isRunning(KIND, app)) {
    const run = currentRun(KIND, app);
    if (run) {
      cancelRun(KIND, app, run.id);
      return NextResponse.json({ run: currentRun(KIND, app) ?? run, cancelled: true });
    }
  }

  try {
    return NextResponse.json({ service: stopService(app) });
  } catch (error) {
    return errorResponse(error);
  }
}
