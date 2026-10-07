import type { AppKey, EnvRow, FrontendEnvView } from "@/lib/types";
import {
  FRONTEND_ENV_KEYS,
  readFrontendEnv,
  stageOutputs,
  type FrontendEnvKey,
} from "./environments";
import { listServices } from "./services";

/**
 * What a frontend is actually handed, for one environment.
 *
 * A frontend has no environment variables of its own — it has *derived* ones.
 * Every `NEXT_PUBLIC_ACHAR_*` it reads is a stack output with a different name,
 * which is why this table is short and why the interesting column is `source`:
 * the value did not come from a file anybody edited, it came from a deploy.
 *
 * Three details that explain most surprises:
 *
 * - **`NEXT_PUBLIC_*` is inlined at build time.** Next substitutes these while
 *   compiling, so in a built app the value is frozen into the JavaScript a
 *   browser downloads, and changing the file does nothing until the app is built
 *   again. The two places one of these values is real are therefore the dev
 *   server the console starts with them and the build that inlines them — the
 *   **Build** tab is where the second one happens, and it is why a build is worth
 *   watching rather than a spinner.
 * - **A dev server started from the console reads these from the process
 *   environment**, not from the file, because `@next/env` fills a key only when
 *   `process.env` does not already have it. So the `value` below is what the app
 *   would be handed here; what is *on disk* is the other half of the story, and
 *   where the two disagree this table says so rather than showing one of them.
 * - **The redirect URLs are not here.** The list Cognito accepts lives on the
 *   pool, not in this table, and it is the environment's settings that write it.
 */

/**
 * Which stack output each variable is a copy of.
 *
 * Named per key rather than derived from the key, because the names do not line
 * up: `NEXT_PUBLIC_ACHAR_AUTH_DOMAIN` is the auth stack's `UserPoolDomain`, and a
 * mapping rule invented to avoid this table would be a second place the two names
 * have to agree. `null` is the region, which is not an output of any stack — it is
 * what the environment's config says and what a client is told to send its tokens
 * to.
 */
const FROM_OUTPUT: Record<FrontendEnvKey, { stack: string; output: string } | null> = {
  NEXT_PUBLIC_ACHAR_API_URL: { stack: "Api", output: "ApiUrl" },
  NEXT_PUBLIC_ACHAR_REGION: null,
  NEXT_PUBLIC_ACHAR_USER_POOL_ID: { stack: "Auth", output: "UserPoolId" },
  NEXT_PUBLIC_ACHAR_USER_POOL_CLIENT_ID: { stack: "Auth", output: "UserPoolClientId" },
  NEXT_PUBLIC_ACHAR_AUTH_DOMAIN: { stack: "Auth", output: "UserPoolDomain" },
};

export async function frontendEnv(
  app: AppKey,
  stage: string,
  ctx: { profile?: string; region?: string } = {},
): Promise<FrontendEnvView> {
  const outputs = await stageOutputs(stage, ctx);
  const local = readFrontendEnv(app);

  const rows: EnvRow[] = FRONTEND_ENV_KEYS.map((key) => {
    const value = outputs.env[key] ?? null;
    const from = FROM_OUTPUT[key];
    const where = from
      ? `Achar${from.stack}Stack-${stage} · output ${from.output}`
      : "this environment's config · the region a client sends its tokens to";

    // Where the file and the deployment disagree, that is the thing worth
    // saying — a dev server started "as configured" reads the file, one started
    // against this stage reads the output, and both look identical from the
    // browser. A bare `value` column would be showing one of two answers and
    // saying nothing about the other.
    const onDisk = local[key] ?? null;
    const source =
      onDisk && value && onDisk !== value
        ? `${where} · .env.local says ${onDisk}`
        : !value && onDisk
          ? `${where} · nothing — .env.local says ${onDisk}`
          : where;

    // No `usedBy`: every row here is read by the one app this page is about, and
    // a chip under each value naming the app you are already looking at is a
    // column of one value. The field is for a table that spans surfaces.
    return { key, value, source };
  });

  const running = listServices().some(
    (service) => service.app === app && service.status === "running" && service.stage === stage,
  );

  return { app, stage, rows, running };
}
