"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  KeyRoundIcon,
  Loader2Icon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { AcharClient } from "@achar/api";
import type {
  Dataset,
  IssuedApiToken,
  Project,
  ProjectRole,
} from "@achar/types";
import { useViewer } from "@achar/auth";
import type { Viewer } from "@achar/types";
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@achar/ui";

import { CopyRow } from "@/components/ui/copy-row";
import { usePlayground } from "@/components/docs/playground-context";
import { asList } from "@/lib/api-shapes";
import { errorMessage } from "@/lib/errors";

/**
 * The dataset option that means "no scope". Radix reserves the empty string for
 * "nothing is selected", so a scope that can be cleared needs a value of its own.
 */
const ALL_DATASETS = "__all__";

/**
 * Where the token for the playground comes from.
 *
 * **Two ways in, and a signed-in reader gets the better one.** Signed out, the only
 * honest offer is a box to paste a token into, and a line saying where tokens are
 * made. Signed in, this page can mint one: it asks the API for the projects you are
 * a member of, you name the token and choose what it may do, and the answer — shown
 * once, and only once — goes straight into the playground.
 *
 * The client is built here rather than handed down by a provider. Every other
 * signed-in surface in this app has exactly one client for the whole tree
 * (`components/client-provider`), and it holds its children back behind a skeleton
 * until that client exists. On a page that is nine-tenths static reference that wait
 * is a page that does not draw for a moment for no reason, so the calls below build
 * a client when they run and nothing waits on one they have not made.
 *
 * What it says about the token is the part worth reading twice: it is kept in this
 * tab's session, it is sent from your browser straight to the API, and nothing about
 * it passes through this site's server. That is true of every request the playground
 * makes, and it is the reason the playground is worth having.
 */
export function CredentialPanel({
  apiUrl,
  withSession,
}: {
  apiUrl: string;
  /**
   * Whether a session can be read at all.
   *
   * The site mounts its provider only when a user pool is configured — with no pool
   * `AuthProvider` answers with its own "sign-in is not configured" screen, which
   * would take the whole public site offline — and `useViewer` outside a provider
   * throws. So the hook is called by `WithSession`, which the layout's own answer
   * decides whether to mount. A deployment with no pool gets the paste box and no
   * minting, which is the honest version of the same page: there is nothing to sign
   * in to.
   */
  withSession: boolean;
}) {
  return withSession ? (
    <WithSession apiUrl={apiUrl} />
  ) : (
    <Panel
      apiUrl={apiUrl}
      viewer={null}
      sessionLoading={false}
      getToken={null}
    />
  );
}

/** The same panel, with the session it is allowed to read. */
function WithSession({ apiUrl }: { apiUrl: string }) {
  const { viewer, loading, getToken } = useViewer();
  return (
    <Panel
      apiUrl={apiUrl}
      viewer={viewer}
      sessionLoading={loading}
      getToken={getToken}
    />
  );
}

function Panel({
  apiUrl,
  viewer,
  sessionLoading: session,
  getToken,
}: {
  apiUrl: string;
  viewer: Viewer | null;
  sessionLoading: boolean;
  getToken: (() => Promise<string | null>) | null;
}) {
  const { credential, ready, useToken, forget } = usePlayground();

  const [pasting, setPasting] = useState("");
  const [issued, setIssued] = useState<IssuedApiToken | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function revoke() {
    if (!credential?.tokenId || !credential.projectId || !getToken) return;
    setRevoking(true);
    try {
      const client = await signedInClient(apiUrl, getToken);
      await client.revokeToken(credential.projectId, credential.tokenId);
      forget();
      setIssued(null);
    } catch {
      // The panel is a convenience; a revoke that failed says so on the next try
      // rather than throwing a page-level error over a token the reader can also
      // take back in the studio.
    } finally {
      setRevoking(false);
    }
  }

  if (!ready || session) {
    return <div className="h-28 rounded-xl border border-border bg-muted/40" />;
  }

  return (
    <div className="space-y-3">
      {credential && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheckIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm">
                {credential.name ? `${credential.name} — ` : ""}
                {credential.label}
              </p>
              <p className="text-xs text-muted-foreground">
                In use for the requests below, and kept in this tab only. Every
                request goes from this browser to the API — nothing passes
                through this site.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {credential.tokenId && credential.projectId && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void revoke()}
                  disabled={revoking}
                >
                  {revoking ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <Trash2Icon className="size-4" />
                  )}
                  Revoke
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={forget}>
                Forget
              </Button>
            </div>
          </div>

          {issued?.token === credential.token && <IssuedOnce />}
        </div>
      )}

      {viewer && getToken ? (
        <MintForm
          apiUrl={apiUrl}
          getToken={getToken}
          onIssued={(token) => {
            useToken(token.token, {
              tokenId: token.tokenId,
              projectId: token.projectId,
              name: token.name,
            });
            setIssued(token);
          }}
        />
      ) : (
        <form
          className="rounded-xl border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault();
            useToken(pasting);
            setPasting("");
          }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <KeyRoundIcon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <label htmlFor="docs-token" className="text-sm font-medium">
                Paste an API token to run the requests below
              </label>
              <p className="text-xs text-muted-foreground">
                Made in the studio, on a project&rsquo;s{" "}
                <span className="font-mono">API</span> screen. It looks like{" "}
                <span className="font-mono">achar_01JQ8Z…_9f2c41…</span> and it
                is shown once.
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              id="docs-token"
              type="password"
              value={pasting}
              onChange={(event) => setPasting(event.target.value)}
              placeholder="achar_…"
              autoComplete="off"
              spellCheck={false}
              className="min-w-56 flex-1 font-mono text-xs"
            />
            <Button
              type="submit"
              size="sm"
              disabled={pasting.trim().length === 0}
            >
              Use this token
            </Button>
            <Button asChild type="button" size="sm" variant="outline">
              {/* Back to this page afterwards: somebody who signed in to try a
                  request should not be dropped in the studio for it. */}
              <Link href="/sign-in?next=/docs">Sign in to make one</Link>
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The token, once — the only time this page will ever hold the secret. */
function IssuedOnce() {
  const { credential } = usePlayground();
  if (!credential) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="flex items-start gap-2 text-xs text-warning">
        <TriangleAlertIcon className="mt-px size-3.5 shrink-0" />
        This is the only time the secret is shown. It is hashed on the server
        the moment it is made, so a lost one is reissued rather than recovered.
      </p>
      <CopyRow
        label="Token"
        value={credential.token}
        hint="Shown once — copy it now."
      />
    </div>
  );
}

/**
 * Minting one, from the docs.
 *
 * The three decisions a token is made of — which project, what it may do, and
 * whether it is scoped to one dataset — asked in the order they narrow: the project
 * chooses the datasets, and the role is what a request is checked against.
 */
function MintForm({
  apiUrl,
  getToken,
  onIssued,
}: {
  apiUrl: string;
  getToken: () => Promise<string | null>;
  onIssued: (token: IssuedApiToken) => void;
}) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<ProjectRole>("VIEWER");
  const [dataset, setDataset] = useState(ALL_DATASETS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const client = await signedInClient(apiUrl, getToken);
        // `asList`, like every other read in this app: the API's lists arrive in
        // one of two shapes and the pages do not care which.
        const list = asList<Project>(await client.listProjects());
        if (!cancelled) setProjects(list);
      } catch {
        if (!cancelled) setProjects([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, getToken]);

  // The datasets of the chosen project, for the optional scope.
  useEffect(() => {
    let cancelled = false;
    setDatasets([]);
    setDataset(ALL_DATASETS);
    if (!projectId) return;

    void (async () => {
      try {
        const client = await signedInClient(apiUrl, getToken);
        const list = asList<Dataset>(await client.listDatasets(projectId));
        if (!cancelled) setDatasets(list);
      } catch {
        if (!cancelled) setDatasets([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, getToken, projectId]);

  const create = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!projectId || !name.trim() || busy) return;

      setBusy(true);
      setError(null);
      try {
        const client = await signedInClient(apiUrl, getToken);
        const token = await client.createToken(projectId, {
          name: name.trim(),
          role,
          ...(dataset && dataset !== ALL_DATASETS ? { dataset } : {}),
        });
        onIssued(token);
        setName("");
      } catch (cause) {
        setError(errorMessage(cause, "Could not make a token"));
      } finally {
        setBusy(false);
      }
    },
    [apiUrl, busy, dataset, getToken, name, onIssued, projectId, role],
  );

  const admins = (projects ?? []).filter((project) => project.role === "ADMIN");

  return (
    <form
      className="rounded-xl border border-border bg-card p-4"
      onSubmit={create}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <KeyRoundIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Make a token for the playground</p>
          <p className="text-xs text-muted-foreground">
            It is issued by the API against your own session and belongs to the
            project you choose — the same thing the studio&rsquo;s{" "}
            <span className="font-mono">API</span> screen does.
          </p>
        </div>
      </div>

      {projects === null ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Reading your projects…
        </p>
      ) : admins.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          You are not an admin of any project. A token is issued by a
          project&rsquo;s admin — make one in the studio, or ask somebody who
          is.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="docs-token-project">Project</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="docs-token-project">
                  <SelectValue placeholder="Choose a project" />
                </SelectTrigger>
                <SelectContent>
                  {admins.map((project) => (
                    <SelectItem
                      key={project.projectId}
                      value={project.projectId}
                    >
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="docs-token-name">Name</Label>
              <Input
                id="docs-token-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Docs playground"
                autoComplete="off"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="docs-token-role">Role</Label>
              <Select
                value={role}
                onValueChange={(next) => setRole(next as ProjectRole)}
              >
                <SelectTrigger id="docs-token-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEWER">Viewer — reads only</SelectItem>
                  <SelectItem value="EDITOR">
                    Editor — reads and writes documents
                  </SelectItem>
                  <SelectItem value="ADMIN">
                    Admin — and manages the project
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="docs-token-dataset">Dataset</Label>
              <Select
                value={dataset}
                onValueChange={setDataset}
                disabled={!projectId}
              >
                <SelectTrigger id="docs-token-dataset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_DATASETS}>
                    The whole project
                  </SelectItem>
                  {datasets.map((entry) => (
                    <SelectItem
                      key={entry.datasetName}
                      value={entry.datasetName}
                    >
                      {entry.datasetName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Optional. One dataset narrows it; none is the whole project.
              </p>
            </div>
          </div>

          {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!projectId || !name.trim() || busy}
            >
              {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />}
              Make a token
            </Button>
            <span className="text-xs text-muted-foreground">
              It appears above, and it is used for every request below from then
              on.
            </span>
          </div>
        </>
      )}
    </form>
  );
}

/**
 * A client carrying the reader's own session token.
 *
 * Built per call rather than kept: the token behind it is short-lived and refreshed
 * by the auth package, and a client held across a long read would be one holding a
 * credential that has expired — which is exactly the bug `components/client-provider`
 * exists to avoid on the screens that fetch continuously.
 */
async function signedInClient(
  apiUrl: string,
  getToken: () => Promise<string | null>,
): Promise<AcharClient> {
  return new AcharClient({ apiUrl, token: await getToken() });
}
