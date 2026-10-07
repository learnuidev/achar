import { Card, CardContent, CardDescription, CardTitle } from '@achar/ui';
import { resolveIcon } from '@/components/content/icon';
import type { Feature } from '@/content/types';

/**
 * One `feature` document.
 *
 * The icon is resolved from the document's own `icon` string rather than being
 * passed in by the grid, so the twelve cards on the front page and the list on
 * the product page draw the same glyph for the same document without either of
 * them knowing what the other does.
 */
export function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = resolveIcon(feature.icon);

  return (
    <Card className="h-full border-border/70 bg-card/60 transition-colors hover:border-primary/40">
      <CardContent className="flex flex-col gap-3 pt-6">
        <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <CardTitle className="text-base">{feature.title}</CardTitle>
        <CardDescription className="leading-relaxed">{feature.description}</CardDescription>
      </CardContent>
    </Card>
  );
}
