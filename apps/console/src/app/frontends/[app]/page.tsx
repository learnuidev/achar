import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FrontendView } from "@/components/frontends/frontend-view";
import { frontendOf } from "@/lib/frontends";

/**
 * One frontend, addressed by name.
 *
 * `/frontends` is the list and this is the thing you open from it, which is why
 * the name is in the path rather than in a dropdown's state: a link to a
 * frontend's output can be sent to somebody, and the back button goes back to the
 * list rather than to whichever frontend was selected before.
 *
 * A slug nobody starts is a 404 rather than an empty page — the set is four names
 * long and the console knows all of them.
 *
 * `params` is a `Promise` in Next 16, so both the page and its metadata await it —
 * and the metadata does its own await rather than being handed the page's result,
 * because Next calls the two independently and in either order.
 */

type Props = { params: Promise<{ app: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { app } = await params;
  const frontend = frontendOf(app);
  return { title: `${frontend?.label ?? "Frontends"} · Achar Console` };
}

export default async function FrontendPage({ params }: Props) {
  const { app } = await params;
  const frontend = frontendOf(app);
  if (!frontend) notFound();

  return <FrontendView app={frontend.value} />;
}
