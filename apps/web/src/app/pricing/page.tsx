import type { Metadata } from 'next';
import { CheckIcon } from 'lucide-react';
import { PricingCard } from '@/components/content/pricing-card';
import { FaqSection } from '@/components/sections/faq';
import { FinalCta } from '@/components/sections/final-cta';
import { getFaqs, getPricingPlans, getSiteSettings } from '@/content';
import type { PricingPlan } from '@/content/types';

/**
 * Pricing.
 *
 * The four cards, then the table, then the questions. The cards are what anybody
 * reads; the table is what somebody forwards to whoever signs; the questions are
 * what stops the third email.
 *
 * The table is derived from the plans rather than written beside them. Its rows
 * are every feature any plan lists, in the order the plans introduce them, and a
 * cell is a tick where that plan's own `features` array contains it. That means
 * adding a feature in the studio adds a row here, and a plan that stops offering
 * something loses its tick — which is the only arrangement under which a
 * comparison table stays true.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Pricing',
    description:
      'Priced by documents, not by editors: four plans, every one of them with the studio, the query API and the CDN.',
  };
}

export default async function PricingPage() {
  const [settings, plans, faqs] = await Promise.all([getSiteSettings(), getPricingPlans(), getFaqs()]);

  return (
    <>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Pricing</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Priced by documents, not by editors.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Every plan includes the content lake, the query API, the studio and CDN delivery. What
              changes is how much content you store, how much of it you serve, and how much of our
              time you get when something is on fire.
            </p>
          </div>

          <div className="mt-14 grid gap-6 lg:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard key={plan.id} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      <Comparison plans={plans} />

      <FaqSection
        faqs={faqs}
        eyebrow="Pricing questions"
        title="Answered before you ask somebody to sign."
      />

      <FinalCta primaryCta={settings.primaryCta} secondaryCta={settings.secondaryCta} />
    </>
  );
}

function Comparison({ plans }: { plans: PricingPlan[] }) {
  // Every feature any plan lists, in the order the plans introduce them, with a
  // case-folded key because "audit log export" and "Audit log export" are the
  // same row and a table with both is a table nobody trusts.
  const rows = new Map<string, string>();
  for (const plan of plans) {
    for (const feature of plan.features) {
      const key = feature.trim().toLowerCase();
      if (!rows.has(key)) rows.set(key, feature.trim());
    }
  }

  if (plans.length === 0 || rows.size === 0) return null;

  return (
    <section id="compare" className="scroll-mt-24 border-b border-border/60 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Compare</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              What is in which plan.
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">Last changed when a plan changed.</p>
        </div>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full border-collapse text-sm text-left">
            <caption className="sr-only">
              Features included in each Achar plan, as each plan document lists them
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-5 py-4 text-left font-medium text-muted-foreground">
                  Included
                </th>
                {plans.map((plan) => (
                  <th
                    key={plan.id}
                    scope="col"
                    className={`px-5 py-4 text-left font-medium ${
                      plan.highlighted ? 'text-primary' : ''
                    }`}
                  >
                    <span className="block">{plan.name}</span>
                    <span className="mt-1 block font-normal text-muted-foreground">
                      {plan.price}
                      {plan.period ? ` · ${plan.period}` : ''}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {[...rows.entries()].map(([key, label]) => (
                <tr key={key} className="border-b border-border/60 last:border-b-0">
                  <th scope="row" className="px-5 py-3 text-left font-normal text-muted-foreground">
                    {label}
                  </th>
                  {plans.map((plan) => {
                    const included = plan.features.some(
                      (feature) => feature.trim().toLowerCase() === key,
                    );
                    return (
                      <td key={plan.id} className="px-5 py-3">
                        {included ? (
                          <>
                            <CheckIcon className="size-4 text-primary" aria-hidden />
                            <span className="sr-only">Included</span>
                          </>
                        ) : (
                          <span className="text-muted-foreground" aria-hidden>
                            —
                          </span>
                        )}
                        {!included ? <span className="sr-only">Not included</span> : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          A tick means the plan&rsquo;s own document lists that line. Everything is editable in the
          studio, and this table follows.
        </p>
      </div>
    </section>
  );
}
