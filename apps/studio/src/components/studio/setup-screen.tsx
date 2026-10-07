'use client';

import { AcharMark, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Separator } from '@achar/ui';
import { TerminalIcon, TriangleAlertIcon } from 'lucide-react';
import { STUDIO_ENV_VARS, envValue } from '@/lib/env';
import { CopyRow } from '@/components/ui/copy-row';

/**
 * What a developer sees first.
 *
 * The studio is not a website that happens to have a backend: it is a window
 * onto one environment's content, and without that environment there is
 * genuinely nothing to draw — no pool to sign in to, no API to list datasets
 * from. The options for this screen are a crash, an empty shell, or an
 * explanation, and only the third one tells somebody what to type next.
 *
 * So it names the five variables the app reads, what each is for, what a real
 * value looks like, and the one command that fills them all in. The values are
 * shown even when they are set but the *other* half is missing, because "four
 * of five" is the commonest state to be in and the empty one is the answer.
 */
export function SetupScreen() {
  const missing = STUDIO_ENV_VARS.filter((variable) => !envValue(variable.name));

  const block = [
    '# Written for you by the console, or filled in by hand.',
    ...STUDIO_ENV_VARS.map((variable) => `${variable.name}=${envValue(variable.name) || variable.example}`),
  ].join('\n');

  return (
    <div className="min-h-svh bg-background">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-14">
        <div className="flex items-center gap-3">
          <AcharMark className="size-8" />
          <div>
            <p className="text-sm font-medium">Achar Studio</p>
            <p className="text-xs text-muted-foreground">The content studio</p>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            No Achar environment is connected
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            The studio is a client of one deployment: it signs people in through that
            deployment&rsquo;s Cognito pool and reads its content API. Neither is configured
            here, so there is nothing to sign in to and no dataset to list. Point it at one and
            this screen is replaced by your projects.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Connect an environment</CardTitle>
            <CardDescription>
              The console writes <code className="font-mono text-xs">apps/studio/.env.local</code>{' '}
              for whichever environment you pick. Run it from the repository root, choose a
              stage, then restart the studio.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs">
                <TerminalIcon className="size-3.5 text-muted-foreground" />
                npm run console
              </div>
              <Button asChild variant="secondary" size="sm">
                <a href="http://localhost:3002" target="_blank" rel="noreferrer">
                  Open the console — localhost:3002
                </a>
              </Button>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">In the console:</span> open{' '}
                <span className="font-mono text-xs">Frontends</span>, choose{' '}
                <span className="font-mono text-xs">studio</span> against the stage you want,
                and press the button that writes its environment.
              </p>
              <p>
                <span className="font-medium text-foreground">By hand:</span> deploy the backend
                with <span className="font-mono text-xs">npm run deploy:dev</span>, then copy the
                stack outputs into the file below.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              The environment variables this app reads
            </CardTitle>
            <CardDescription>
              {missing.length === 0
                ? 'All five are set. If the studio still shows this screen, restart the dev server — these are read when it starts.'
                : `${missing.length} of ${STUDIO_ENV_VARS.length} are unset. All of them live under the repository root, not in this app.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {STUDIO_ENV_VARS.map((variable) => (
              <div key={variable.name} className="space-y-1.5">
                <CopyRow
                  label={variable.name}
                  value={envValue(variable.name)}
                  hint={envValue(variable.name) ? variable.purpose : `${variable.purpose} Example: ${variable.example}`}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">The file, whole</CardTitle>
            <CardDescription>
              Paste this into <code className="font-mono text-xs">apps/studio/.env.local</code>{' '}
              and fill in the values. Unset entries above are shown with an example value so the
              format is unambiguous.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted p-3 font-mono text-xs leading-relaxed">
              {block}
            </pre>
          </CardContent>
        </Card>

        <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-xs text-muted-foreground">
            These variables are <span className="font-medium text-foreground">public</span> —
            anything prefixed <span className="font-mono">NEXT_PUBLIC_</span> ends up in the
            browser. They identify the deployment; they are not credentials. Sign-in is what
            proves who you are, and a token is what the API reads.
          </p>
        </div>

        <Separator />
        <p className="text-xs text-muted-foreground">
          Achar — a content lake, a query language, and the studio that authors against it.
        </p>
      </div>
    </div>
  );
}
