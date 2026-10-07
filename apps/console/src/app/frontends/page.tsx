import type { Metadata } from "next";

import { FrontendsView } from "@/components/frontends/frontends-view";

/**
 * The three apps, as a list.
 *
 * This page is the whole of "where is it running", because there is nowhere else
 * these apps run: a dev server on this machine, started from here, on the port its
 * own `dev` script names. The one app that is not a row somebody can start is the
 * console itself, and the list says so rather than offering a button whose only
 * outcome is a 409 — the refusal is `server/services.ts`'s, in full.
 */

export const metadata: Metadata = {
  title: "Frontends · Achar Console",
};

export default function FrontendsPage() {
  return <FrontendsView />;
}
