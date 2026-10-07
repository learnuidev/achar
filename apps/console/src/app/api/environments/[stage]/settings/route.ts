import { NextResponse } from "next/server";

import type { EnvironmentSettingsInput } from "@/lib/types";
import {
  googleOAuthValues,
  googleSecretStatus,
  readSettings,
  saveSettings,
  settingsContext,
} from "@/server/settings";

/**
 * One environment's settings — read them, write them.
 *
 * `GET` never returns the secret's value, only whether one is stored. `PUT`
 * accepts one and sends it to Secrets Manager; it is write-only in both
 * directions, which is why the form has to be told "a secret is set" rather than
 * being handed the secret to prefill.
 *
 * ## `PUT` reaches the live pool, not only the file
 *
 * The callback and logout URLs are the one part of a save whose effect is not a
 * file: a stage that imports its pool has no deploy that can change the URL lists
 * Cognito accepts, so `saveSettings` writes them onto the app client that is
 * running. What that found is `write.authUrls`, and a stage with no pool yet
 * answers with a sentence rather than a failure — `server/settings.ts` has the
 * reasoning.
 *
 * ## A stage with no config file gets a draft, not a 404
 *
 * That stage is a **new environment**, and these settings are exactly what it
 * needs first: its user pool is built from the Google client id and secret, so
 * there is nothing to deploy until somebody has supplied them. `GET` therefore
 * answers with the product's own values under this stage's name — the mail
 * addresses, the client id, the callback URLs, carried over from a stage that has
 * them — and `PUT` is what writes the file.
 *
 * A 404 therefore means something narrower than it might: no file here, **and**
 * no other stage's file to take the product settings from.
 */

export const dynamic = "force-dynamic";

/**
 * Next 16 hands a route handler its dynamic segments as a `Promise`, the same as
 * a page: the parameters are resolved once and awaited here, and the rest of the
 * handler reads a plain string.
 */
type Params = { params: Promise<{ stage: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { stage } = await params;
  const ctx = settingsContext();
  const settings = readSettings(stage);

  if (!settings) {
    return NextResponse.json(
      {
        error:
          `There is no infra/config/achar-${stage}.json yet, and no completed config to take ` +
          "the product settings from. Write one by hand — it is the file that says what this " +
          "environment creates or imports — and then set these values.",
      },
      { status: 404 },
    );
  }

  settings.googleClientSecretSet = await googleSecretStatus(stage, ctx);
  settings.oauth = await googleOAuthValues(stage, ctx, settings.account);

  return NextResponse.json({ settings });
}

export async function PUT(request: Request, { params }: Params) {
  const { stage } = await params;

  let body: EnvironmentSettingsInput;
  try {
    body = (await request.json()) as EnvironmentSettingsInput;
  } catch {
    return NextResponse.json({ error: "The request body was not JSON." }, { status: 400 });
  }

  if (!body?.auth || !body?.mail) {
    return NextResponse.json(
      { error: "Expected an 'auth' and a 'mail' block." },
      { status: 400 },
    );
  }

  try {
    const ctx = settingsContext();
    const { settings, write } = await saveSettings(stage, body, ctx);
    return NextResponse.json({ settings, write });
  } catch (error) {
    // A validation problem is the user's to fix and reads as a sentence; a CLI
    // failure is ours and arrives with the CLI's own last lines.
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
