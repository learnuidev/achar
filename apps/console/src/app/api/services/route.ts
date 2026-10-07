import { NextResponse } from "next/server";

import { listServices, occupiedPorts } from "@/server/services";

/**
 * The four frontends, as the cards draw them.
 *
 * `occupied` is the one piece of extra information: a port something else is
 * already listening on is the failure a start would otherwise report as four
 * lines of Node stack trace from inside a spawned process.
 *
 * A port belonging to a dev server this console is holding is **not** reported
 * as occupied — that is the console's own process on its own app's port, and a
 * warning about it would be a warning on a card that is working.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const services = listServices();
  const ours = new Set(
    services.filter((service) => service.status !== "stopped").map((service) => service.port),
  );
  const occupied = (await occupiedPorts()).filter((port) => !ours.has(port));

  return NextResponse.json({ services, occupied });
}
