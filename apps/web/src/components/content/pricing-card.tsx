import Link from 'next/link';
import { CheckIcon } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardDescription, CardTitle, cn } from '@achar/ui';
import type { PricingPlan } from '@/content/types';

/**
 * One `pricingPlan` document.
 *
 * Everything on the card comes from the document — the name, the price string,
 * the feature list, the button's label and where it goes — because a plan's terms
 * are the one kind of copy on this site that a person changes without a deploy.
 * The price is a string for the same reason it is a string in the schema: `Free`,
 * `$0`, `Custom` and `$15` are all prices, and a number field would have to
 * pretend three of them are not.
 */
export function PricingCard({
  plan,
  className,
  showPeriod = true,
}: {
  plan: PricingPlan;
  className?: string;
  /** Off where the card sits beside a comparison table that already says it. */
  showPeriod?: boolean;
}) {
  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        plan.highlighted ? 'border-primary/60 shadow-lg shadow-primary/5' : 'border-border/70',
        className,
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          {plan.highlighted ? <Badge>Most popular</Badge> : null}
        </div>

        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
          {showPeriod && plan.period ? (
            <span className="text-sm text-muted-foreground">{plan.period}</span>
          ) : null}
        </div>

        <CardDescription className="leading-relaxed">{plan.description}</CardDescription>

        <ul className="mt-2 flex flex-col gap-2 text-sm">
          {plan.features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              <span className="text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>

        <div className="mt-auto pt-6">
          <Button asChild variant={plan.highlighted ? 'default' : 'outline'} className="w-full">
            <Link href={plan.ctaHref}>{plan.ctaLabel}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
