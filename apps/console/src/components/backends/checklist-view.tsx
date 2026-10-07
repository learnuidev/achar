"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRightIcon, TriangleAlertIcon, XIcon } from "lucide-react";

import { SettingsForm } from "@/components/settings/settings-form";
import { GoogleCard } from "@/components/settings/google-card";
import { useSettings } from "@/components/settings/use-settings";
import { IconButton } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Chip, Dot, type Tone } from "@/components/ui/chip";
import { backendPath } from "@/lib/backends";
import type { EnvironmentSettings } from "@/lib/types";

/**
 * The Checklist: everything this environment needs **from a person**.
 *
 * The Deployments tab is the checklist of what the *console* will do — eleven
 * steps, each with a check. This is the other half, and it is deliberately a tab
 * of its own, because these are the things no step can do for you:
 *
 * - **The config file**, which is what the stacks are built from. A new
 *   environment has none, and saving this tab's form is what writes one.
 * - **Google sign-in** — a client id, a client secret and the URLs Cognito will
 *   accept. This environment's user pool is built with a Google identity
 *   provider, and nothing anywhere can discover those three.
 * - **Mail and origins** — the sender invitations come from, and the three app
 *   base URLs, which are baked into every handler's environment.
 *
 * So the tab both *asks* and *answers*: a row with a tick is a requirement that
 * is met, and a row without one is a sentence about the missing thing beside the
 * form that supplies it.
 *
 * The whole tab is one `useSettings` request: the rows and the form's fields are
 * the same answer, and asking twice is how a page ends up disagreeing with
 * itself after a save.
 */
export function ChecklistView({ stage }: { stage: string }) {
  const { settings, loading, saving, saved, write, error, save, dismissError } =
    useSettings(stage);

  const rows = useMemo(() => (settings ? requirements(stage, settings) : []), [stage, settings]);
  const ready = rows.filter((row) => row.done).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeading
          title="What this environment needs"
          hint="The values nothing can discover, and the config file the stacks are built from. All of it has to be in place before a deploy can create this environment's pool and API."
          action={
            rows.length > 0 ? (
              <Chip tone={ready === rows.length ? "ok" : "warn"} monospace>
                {ready} / {rows.length}
              </Chip>
            ) : null
          }
        />

        {loading && !settings ? (
          <p className="text-muted-foreground mt-4 text-sm">Reading the environment…</p>
        ) : (
          <div className="mt-4 flex flex-col">
            {rows.map((row) => (
              <RequirementRow key={row.id} row={row} />
            ))}
          </div>
        )}
      </Card>

      {error ? (
        <div className="border-destructive/35 bg-destructive/10 text-destructive flex items-start gap-3 rounded-3xl border px-5 py-4 text-sm">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <pre className="flex-1 font-sans whitespace-pre-wrap">{error}</pre>
          <IconButton onClick={dismissError} aria-label="Dismiss">
            <XIcon className="size-3.5" />
          </IconButton>
        </div>
      ) : null}

      {/* Above the credentials, and **outside** the form: these two are outputs
          to copy rather than inputs to fill in, so they must not sit behind a
          save button that has nothing to do with them. */}
      {settings ? <GoogleCard stage={stage} settings={settings} /> : null}

      {/* Always open. "Change the callback URLs" and "replace the client secret"
          are not missing requirements, and they are exactly what this form is
          for — so the fields are shown rather than folded away once the rows
          above are all ticked. A page whose whole subject is the values a person
          has to supply should show them. */}
      {settings ? (
        <SettingsForm
          key={stage}
          stage={stage}
          settings={settings}
          creating={!settings.hasConfig}
          saving={saving}
          saved={saved}
          write={write}
          onSubmit={save}
        />
      ) : null}

      <Card>
        <CardHeading
          title="Then: the deploy"
          hint="What is above is the inputs. What a deploy does with them — write the config file, bootstrap the account, bundle the handlers, deploy the five stacks — is on the Deployments tab, and every step whose check finds its work already done is a check mark rather than a run."
          action={
            <Link
              href={`${backendPath(stage)}?tab=deployments`}
              className="border-border/70 bg-card hover:bg-accent inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors"
            >
              Open the deploy checklist
              <ArrowRightIcon className="size-3.5" />
            </Link>
          }
        />
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * The requirements
 * ------------------------------------------------------------------ */

interface Requirement {
  id: "config" | "google" | "mail";
  title: string;
  label: string;
  note: string;
  tone: Tone;
  done: boolean;
}

/**
 * What is missing, in the order it has to be supplied.
 *
 * The config file comes first because it is what the rest is written *into*, and
 * the two that follow are the values it carries. Every note names the thing that
 * is absent rather than the state of the row — "no client secret stored" is
 * actionable, "not ready" is not.
 */
function requirements(stage: string, settings: EnvironmentSettings): Requirement[] {
  const google = googleGaps(settings);
  const mail = mailGaps(settings);

  return [
    {
      id: "config",
      title: "The config file",
      done: settings.hasConfig,
      tone: settings.hasConfig ? "ok" : "warn",
      label: settings.hasConfig ? "written" : "not written",
      note: settings.hasConfig
        ? `${settings.configPath} — the resources the five stacks create, or import by name.`
        : `Nothing on disk yet: saving the credentials below writes ${settings.configPath} as a new environment, which creates its own tables, assets bucket, distribution and pool.${
            settings.seededFrom
              ? ` Its product settings start from achar-${settings.seededFrom}.json — no other environment's data is copied.`
              : ""
          }`,
    },
    {
      id: "google",
      title: "Google sign-in",
      done: google.length === 0,
      tone: google.length === 0 ? "ok" : "warn",
      label: google.length === 0 ? "provided" : "needs you",
      note:
        google.length === 0
          ? [
              settings.auth.googleClientId,
              // An imported pool already has its provider attached, so no
              // deploy reads a secret and its absence is not a requirement.
              settings.needsGoogleSecret
                ? `secret stored at ${settings.googleClientSecretName}`
                : "the pool is imported, so a deploy reads no secret",
              `${settings.auth.callbackUrls.length} callback URL${
                settings.auth.callbackUrls.length === 1 ? "" : "s"
              }`,
            ].join(" · ")
          : `This environment creates its own user pool, and the pool is built with a Google identity provider — so ${
              google.join(", ")
            }. The console cannot look these up, and a deploy without them fails inside Cognito rather than here.`,
    },
    {
      id: "mail",
      title: "Mail and origins",
      done: mail.length === 0,
      tone: mail.length === 0 ? "ok" : "warn",
      label: mail.length === 0 ? "set" : "needs you",
      note:
        mail.length === 0
          ? `${settings.mail.fromAddress} · ${settings.mail.appBaseUrl} · ${settings.mail.studioBaseUrl} · ${settings.mail.consoleBaseUrl}`
          : `The invitation sender and the three app base URLs are baked into every handler's environment, and ${mail.join(", ")}.`,
    },
  ];
}

/** The Google values that are missing, named one at a time. */
function googleGaps(settings: EnvironmentSettings): string[] {
  const gaps: string[] = [];
  if (!settings.auth.googleClientId) gaps.push("no client id");
  if (settings.needsGoogleSecret && !settings.googleClientSecretSet) gaps.push("no client secret stored");
  if (settings.auth.callbackUrls.length === 0) gaps.push("no callback URLs");
  if (settings.auth.logoutUrls.length === 0) gaps.push("no logout URLs");
  return gaps;
}

/**
 * The mail values that are missing.
 *
 * The from address and all three base URLs, because all four are baked into the
 * handlers at deploy: an empty one is a Lambda that starts and then fails at the
 * invitation the first person to sign up was waiting for.
 */
function mailGaps(settings: EnvironmentSettings): string[] {
  const gaps: string[] = [];
  if (!settings.mail.fromAddress) gaps.push("the from address is empty");
  if (!settings.mail.appBaseUrl) gaps.push("the web base URL is empty");
  if (!settings.mail.studioBaseUrl) gaps.push("the studio base URL is empty");
  if (!settings.mail.consoleBaseUrl) gaps.push("the console base URL is empty");
  return gaps;
}

/* ------------------------------------------------------------------ *
 * One row
 * ------------------------------------------------------------------ */

function RequirementRow({ row }: { row: Requirement }) {
  return (
    <div className="border-border/40 flex flex-wrap items-start gap-3 border-t py-3 first:border-t-0">
      <Dot tone={row.tone} className="mt-2" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{row.title}</span>
          <Chip tone={row.tone}>{row.label}</Chip>
        </div>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{row.note}</p>
      </div>
    </div>
  );
}
