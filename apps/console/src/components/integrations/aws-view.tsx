"use client";

import type { ReactNode } from "react";
import { CloudIcon, ShieldCheckIcon, TerminalIcon } from "lucide-react";

import { useShell } from "@/components/console/state";
import { Card, CardHeading } from "@/components/ui/card";
import { Chip, Dot } from "@/components/ui/chip";
import type { AwsIntegrationView } from "@/lib/types";

/**
 * AWS, as this console sees it: which CLI, who it is acting as, and what this
 * repository has left in the account.
 *
 * Every other page here is downstream of one question — *which account, as
 * which identity?* — and this is where that answer lives. The profile is worth
 * showing with its source, because the console takes it from the ambient
 * `AWS_PROFILE` and from nowhere else, and "which profile am I actually using"
 * is the first thing to check when a deploy fails with an authorization error
 * that names nothing.
 *
 * **It has to draw with nothing set up.** A checkout where nobody has installed
 * the CLI, no credentials have been configured and nothing has ever been
 * deployed is not an error state — it is the state of the machine the console
 * is most nearly useless on, and so the one where it has to say the most. Which
 * is why the CLI is a row rather than a precondition, why the region is shown
 * even when the account cannot be read, and why each empty list below carries
 * the reason it is empty: without that, "no stacks" and "the credential expired"
 * are the same screen.
 *
 * The console only ever *reads* AWS. Every call in `server/aws.ts` is a
 * `describe`, a `list` or a `get`; the writes are all in `infra/` and reachable
 * only through a deploy or one of its scripts.
 */
export function AwsView() {
  const { state, error, loading } = useShell();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">AWS</h1>
        <p className="text-muted-foreground text-sm">
          The account the console acts on behalf of — read-only, and asked about as a whole account
          rather than one environment at a time.
        </p>
      </header>

      {state ? (
        <Account aws={state} />
      ) : (
        <Card>
          <CardHeading
            title="Nothing has been read yet"
            hint="The console asks the machine for the CLI, the identity and the account in one request when the page loads."
          />
          <p className="text-muted-foreground mt-5 text-xs">
            {error ?? (loading ? "Reading the machine…" : "The request has not come back yet.")}
          </p>
        </Card>
      )}
    </div>
  );
}

/**
 * The page itself, drawn from `AwsIntegrationView` — the shape `lib/types.ts`
 * says this page reads.
 *
 * A component of its own so the null state is handled once, in one place, rather
 * than as a `state?.` on every row: a page about what an account holds has
 * nothing useful to say while it does not know which account that is.
 */
function Account({ aws }: { aws: AwsIntegrationView }) {
  const identity = aws.identity;

  return (
    <>
      <Card>
        <CardHeading
          title="The CLI"
          hint="Every read on every page is this binary with the profile above — there is no SDK client anywhere in this app, so that the console and a deploy can never resolve credentials two different ways."
          action={
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 font-mono text-xs">
              <TerminalIcon className="size-3.5" />
              {aws.cli.installed ? "on PATH" : "not found"}
            </span>
          }
        />

        {aws.cli.installed ? (
          <div className="mt-5 flex flex-col">
            <Row label="Version" value={aws.cli.version ?? "an unknown version"} />
            <Row label="Path" value={aws.cli.path ?? "found, but not as a path"} />
          </div>
        ) : (
          <p className="text-destructive mt-5 text-sm leading-relaxed">
            There is no <span className="font-mono">aws</span> on this machine&rsquo;s PATH, so
            nothing on this page or any other could be read. Every environment will draw as not
            deployed until it is installed and a profile is configured.
          </p>
        )}
      </Card>

      <Card>
        <CardHeading
          title="Identity"
          hint="Read once, and re-read on every focus and every thirty seconds — a stale SSO session is the most common reason a page here goes quiet."
          action={
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 font-mono text-xs">
              <ShieldCheckIcon className="size-3.5" />
              {identity ? "resolved" : "unresolved"}
            </span>
          }
        />

        {/* The region is the console's own setting and is known whether or not
            credentials resolve; the account is only ever an answer from `sts`,
            so it is a row only when there is an answer to put in it. */}
        <div className="mt-5 flex flex-col">
          {identity ? <Row label="Account" value={identity.account} /> : null}
          <Row label="Region" value={aws.region} />
          <Row label="Profile" value={aws.profile} />
          <Row label="Profile from" value={aws.profileSource} />
          {identity ? <Row label="Caller" value={identity.arn} /> : null}
          {identity ? <Row label="User id" value={identity.userId} /> : null}
        </div>

        {identity ? null : (
          <p className="text-destructive mt-4 text-sm leading-relaxed">
            {aws.identityError ?? "The identity could not be read."}
          </p>
        )}
      </Card>

      <Card>
        <CardHeading
          title="What is in it"
          hint="Everything in this account and region that carries the repository's own name. One environment's view of the same account is on the Backends pages, and CDK's nested stacks are kept and labelled rather than filtered out — a name here that nothing else mentions is worth being able to see."
        />

        <div className="mt-5 flex flex-col gap-6">
          <Section title="CloudFormation stacks" count={aws.stacks.length}>
            {aws.stacks.length > 0 ? (
              aws.stacks.map((stack) => (
                <div
                  key={stack.name}
                  className="border-border/40 flex items-center gap-3 border-t py-2 text-xs"
                >
                  <Dot tone={stack.healthy ? "ok" : "warn"} />
                  <span className="truncate font-mono">{stack.name}</span>
                  {stack.nested ? <Chip tone="muted">nested</Chip> : null}
                  <span className="text-muted-foreground ml-auto shrink-0 font-mono">
                    {stack.status}
                  </span>
                </div>
              ))
            ) : (
              <Note
                text={whyEmpty(
                  aws,
                  "No Achar stacks in this account and region yet. An environment that has been deployed has five.",
                )}
              />
            )}
          </Section>

          <Section title="DynamoDB tables" count={aws.tables.length}>
            {aws.tables.length > 0 ? (
              <Names names={aws.tables} />
            ) : (
              <Note
                text={whyEmpty(
                  aws,
                  "No achar- tables in this account and region yet. An environment that owns its data creates ten.",
                )}
              />
            )}
          </Section>

          <Section title="S3 buckets" count={aws.buckets.length}>
            {aws.buckets.length > 0 ? (
              <Names names={aws.buckets} />
            ) : (
              <Note
                text={whyEmpty(
                  aws,
                  "No achar- buckets in this account and region yet. An environment that owns its media creates one for assets.",
                )}
              />
            )}
          </Section>
        </div>
      </Card>

      <Card>
        <CardHeading title="How the console reaches it" />
        <div className="text-muted-foreground mt-4 flex flex-col gap-2 text-xs leading-relaxed">
          <p className="flex gap-2.5">
            <CloudIcon className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Every call shells out to the <span className="font-mono">aws</span> CLI with the
              profile above, because the CLI is already configured here and a second credential path
              is a second thing to go stale. Nothing here writes: a deploy and its scripts are the
              only things in this repository that change AWS.
            </span>
          </p>
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * The pieces the page is made of
 * ------------------------------------------------------------------ */

/** One list of what is in the account, with how many there are. */
function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <Chip tone={count > 0 ? "accent" : "muted"} monospace>
          {count}
        </Chip>
      </div>
      {children}
    </section>
  );
}

/** Plain names — a table or a bucket, where the name is the whole of the fact. */
function Names({ names }: { names: string[] }) {
  return (
    <>
      {names.map((name) => (
        <div
          key={name}
          className="border-border/40 text-muted-foreground truncate border-t py-2 font-mono text-xs"
        >
          {name}
        </div>
      ))}
    </>
  );
}

function Note({ text }: { text: string }) {
  return (
    <p className="border-border/40 text-muted-foreground border-t py-2 text-xs leading-relaxed">
      {text}
    </p>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-border/40 flex flex-wrap items-baseline gap-3 border-t py-2.5 text-xs first:border-t-0">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <code className="min-w-0 flex-1 break-all font-mono">{value}</code>
    </div>
  );
}

/**
 * Why a list is empty, which is the one thing this page must not get wrong.
 *
 * Three lists are empty in three different situations — nobody has deployed
 * here, credentials could not be read, and the CLI is not installed at all — and
 * they arrive as the same empty array. So the reason is asked for first, and
 * "nothing here yet" is only said when the reads actually happened: it is a
 * sentence about the account, and it is a lie about the machine.
 */
function whyEmpty(aws: AwsIntegrationView, nothing: string): string {
  if (!aws.cli.installed) {
    return "Nothing could be listed: there is no aws on this machine's PATH.";
  }
  if (!aws.identity) {
    return `Nothing could be listed: ${aws.identityError ?? "the account could not be read."}`;
  }
  return nothing;
}
