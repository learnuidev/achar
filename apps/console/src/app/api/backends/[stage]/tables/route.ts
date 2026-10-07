import { NextResponse } from "next/server";

import { backendContext } from "@/server/backend";
import { backendTables, describeTable, readTableItems } from "@/server/tables";

/**
 * A backend environment's tables.
 *
 * With no `?table=`, the list of them — which is one `describe-stacks` on the
 * environment's data stack, because a row count is one `DescribeTable` per table
 * and there are ten of them.
 *
 * With one, everything about that table: its shape, and a page of its rows. The
 * form's fields — `attribute`, `operator`, `value`, `type`, `index` — are what
 * make the difference between reading the table in its own order and asking it a
 * question, and `token` is the cursor the previous page ended on, handed back for
 * the next one.
 *
 * **Every call this route makes is a read.** `DescribeTable`, `Query`, `Scan` —
 * there is no path through here that writes a row, which is the console's own
 * rule about AWS and the reason this tab has no save button anywhere on it.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  // Next 16 hands a route's own parameters over as promises, exactly as it does
  // a page's: `await params` is not ceremony, and a handler that read `stage` off
  // the promise would build `/api/backends/[object Promise]/tables` and fetch
  // nothing at all.
  { params }: { params: Promise<{ stage: string }> },
) {
  const { stage } = await params;
  const url = new URL(request.url);
  const wanted = url.searchParams.get("table");
  const ctx = backendContext();

  try {
    // The list is read on every call rather than trusted from the request. The
    // request names a table by string, and this is the check that turns it into
    // a table *this environment reads*: without it the route would answer about
    // any table in the account whose name somebody happened to know, which is a
    // console that can be pointed at another product's data by editing a URL.
    const list = await backendTables(stage, ctx);

    if (!wanted) {
      return NextResponse.json(list);
    }

    const known = list.tables.find(
      (candidate) =>
        candidate.name === wanted || candidate.key === wanted || candidate.logical === wanted,
    );
    if (!known) {
      return NextResponse.json(
        { error: `No table '${wanted}' in ${stage}.` },
        { status: 404 },
      );
    }

    // Null when the table has gone since the list was drawn — deleted by hand,
    // or by a stage somebody took down this morning — which is a 404 about this
    // table rather than a 500 about the route.
    const table = await describeTable(known.name, ctx);
    if (!table) {
      return NextResponse.json(
        { error: `${known.name} is listed for ${stage} but is no longer in this account.` },
        { status: 404 },
      );
    }

    // No attribute and no value means "show me the table as it is", so the page
    // is read without any question being asked of it — which is what opening a
    // table should do.
    const items = await readTableItems(
      {
        table: known.name,
        attribute: url.searchParams.get("attribute") ?? undefined,
        operator: url.searchParams.get("operator") ?? undefined,
        value: url.searchParams.get("value") ?? undefined,
        type: url.searchParams.get("type") ?? undefined,
        index: url.searchParams.get("index") ?? undefined,
        exclusiveStartKey: url.searchParams.get("token") ?? undefined,
        limit: Number(url.searchParams.get("limit") ?? "") || undefined,
      },
      ctx,
    );

    return NextResponse.json({ ...list, table, items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
