import type { Metadata } from 'next';
import { QuoteIcon } from 'lucide-react';
import { Card, CardContent } from '@achar/ui';
import { Stat } from '@/components/content/stat';
import { FinalCta } from '@/components/sections/final-cta';
import { LogoBar } from '@/components/sections/logo-bar';
import { getCustomers, getSiteSettings } from '@/content';

/**
 * The customer wall, at length.
 *
 * The homepage shows two or three; this shows all of them, in the corpus's own
 * `order`, which is a decision somebody made about which story answers which
 * objection. Each story is one card with its own numbers, because the metric is
 * the part that survives being forwarded to a manager.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Customers',
    description:
      'Teams who moved their content into one lake — publishers, healthcare, financial services, retail, manufacturing and travel — and what changed after they did.',
  };
}

export default async function CustomersPage() {
  const [settings, customers] = await Promise.all([getSiteSettings(), getCustomers()]);

  return (
    <>
      <section className="border-b border-border/60">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Customers</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              One lake, several front doors, nobody copying a sentence by hand.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground">
              Every story below is a `customer` document in the dataset this page was rendered from:
              the quote, the person who said it, the industry, and the numbers they were willing to
              put their name beside.
            </p>
          </div>
        </div>
      </section>

      <LogoBar customers={customers} />

      <section className="border-b border-border/60">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2">
          {customers.map((customer) => (
            <Card key={customer.id} className="h-full border-border/70">
              <CardContent className="flex h-full flex-col gap-6 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-medium tracking-tight">{customer.name}</p>
                    {customer.industry ? (
                      <p className="text-xs uppercase tracking-widest text-muted-foreground">
                        {customer.industry}
                      </p>
                    ) : null}
                  </div>
                  <QuoteIcon className="size-5 shrink-0 text-primary" aria-hidden />
                </div>

                {customer.quote ? (
                  <blockquote className="leading-relaxed">{customer.quote}</blockquote>
                ) : null}

                {customer.quoteAuthor ? (
                  <p className="text-sm text-muted-foreground">{customer.quoteAuthor}</p>
                ) : null}

                {customer.metrics.length > 0 ? (
                  <div className="mt-auto grid gap-6 border-t border-border pt-6 sm:grid-cols-3">
                    {customer.metrics.map((metric) => (
                      <Stat key={metric.label} value={metric.value} label={metric.label} />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <FinalCta primaryCta={settings.primaryCta} secondaryCta={settings.secondaryCta} />
    </>
  );
}
