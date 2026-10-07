import { NextResponse } from "next/server";

import { backendContext, backendEnv } from "@/server/backend";

/**
 * A backend environment's inputs and outputs.
 *
 * `params` is a `Promise` in Next 16 and is awaited once, at the top, into a
 * local: the alternative is `(await params).stage` at each use, which is one
 * chance per call site to get it wrong.
 */
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ stage: string }> }) {
  const { stage } = await params;

  try {
    const env = await backendEnv(stage, backendContext());
    return NextResponse.json({ env });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
