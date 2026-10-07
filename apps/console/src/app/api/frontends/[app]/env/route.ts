import { NextResponse } from "next/server";

import { appDefinition } from "@/server/repo";
import { frontendEnv } from "@/server/frontends";
import { settingsContext } from "@/server/settings";

/**
 * What one frontend is handed for one environment.
 *
 * The app is resolved through `appDefinition` rather than a set of names written
 * here, so this route and the console's list of apps cannot disagree about what
 * the four are.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ app: string }> };

export async function GET(request: Request, { params }: Params) {
  const { app: slug } = await params;
  const app = appDefinition(slug);
  if (!app) {
    return NextResponse.json(
      { error: `'${slug}' is not one of the four apps in this workspace.` },
      { status: 404 },
    );
  }

  // `dev` when nothing is named: it is the stage a fresh checkout means, which is
  // the same guess `listStages` makes.
  const stage = new URL(request.url).searchParams.get("stage")?.trim() || "dev";

  try {
    const env = await frontendEnv(app.key, stage, settingsContext());
    return NextResponse.json({ env });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
