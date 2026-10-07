import { PlugIcon } from 'lucide-react';
import { Badge, Card, CardContent, CardDescription, CardTitle } from '@achar/ui';
import type { Integration } from '@/content/types';

/**
 * The catalog, as a grid of cards.
 *
 * An integration is deliberately the least interesting document in the corpus —
 * a name, a sentence, a category — because that is what it is: the answer to
 * "does this connect to what we already run". The cards do not link anywhere.
 * Somewhere to click that says "learn more" and then says nothing is worse than a
 * card that just tells you.
 */
export function Integrations({ integrations }: { integrations: Integration[] }) {
  if (integrations.length === 0) return null;

  return (
    <section id="integrations" className="scroll-mt-24 border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Integrations</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            The content goes where the work already happens.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Achar is a query endpoint and a webhook, so the interesting question is never whether it
            integrates — it is what you point at it. These are the ones teams ask about first.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {integrations.map((integration) => (
            <Card key={integration.id} className="h-full border-border/70 bg-card/60">
              <CardContent className="flex h-full flex-col gap-3 pt-6">
                <div className="flex items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                    <PlugIcon className="size-4" aria-hidden />
                  </span>
                  {integration.category ? (
                    <Badge variant="secondary" className="ml-auto">
                      {integration.category}
                    </Badge>
                  ) : null}
                </div>

                <CardTitle className="text-base">{integration.name}</CardTitle>
                <CardDescription className="leading-relaxed">{integration.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
