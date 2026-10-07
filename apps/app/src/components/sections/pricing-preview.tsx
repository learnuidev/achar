import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { PricingCard } from '@/components/content/pricing-card';
import type { PricingPlan } from '@/content/types';

/**
 * Three of the four plans, and a way to see the rest.
 *
 * The fourth is left off on purpose: the front page is choosing between "free,
 * soon, or now", and the plan that exists for a procurement conversation belongs
 * on the pricing page where somebody is actually having it. Which three is the
 * corpus's order, not a list written here.
 */
export function PricingPreview({ plans }: { plans: PricingPlan[] }) {
  const preview = plans.slice(0, 3);
  if (preview.length === 0) return null;

  return (
    <section id="pricing" className="scroll-mt-24 border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Pricing</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Priced by documents, not by editors.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Invite the whole company to the studio on every plan. What a plan changes is how much
              content you store, how much bandwidth you serve, and how much of a conversation you get
              to have with us about it.
            </p>
          </div>

          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
          >
            Compare all plans
            <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {preview.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      </div>
    </section>
  );
}
