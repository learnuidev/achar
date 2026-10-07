import { QuoteIcon } from 'lucide-react';
import { Card, CardContent } from '@achar/ui';
import { Stat } from '@/components/content/stat';
import type { Customer } from '@/content/types';

/**
 * Two or three customers, with the numbers they agreed to.
 *
 * A quote on a marketing page is worth exactly what the metric beside it is
 * worth. Both come from the same `customer` document, so a story without metrics
 * still renders as a quote — one column, no invented figures — and a story with
 * them renders as proof.
 */
export function CustomerProof({ customers }: { customers: Customer[] }) {
  const stories = customers.filter((customer) => customer.quote.length > 0).slice(0, 3);
  if (stories.length === 0) return null;

  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Customers</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Teams who stopped maintaining four copies of the same sentence.
            </h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {/* The stories below are documents in this site's own dataset. */}
            Every story here is a document in the dataset this page was rendered from.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {stories.map((customer) => (
            <Card key={customer.id} className="h-full border-border/70 bg-card">
              <CardContent className="flex h-full flex-col gap-6 pt-6">
                <QuoteIcon className="size-5 text-primary" aria-hidden />

                <blockquote className="text-lg leading-relaxed">{customer.quote}</blockquote>

                <div className="flex flex-col gap-1">
                  <span className="font-medium">{customer.name}</span>
                  {customer.quoteAuthor ? (
                    <span className="text-sm text-muted-foreground">{customer.quoteAuthor}</span>
                  ) : null}
                  {customer.industry ? (
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {customer.industry}
                    </span>
                  ) : null}
                </div>

                {customer.metrics.length > 0 ? (
                  <div className="mt-auto grid gap-6 border-t border-border pt-6 sm:grid-cols-2">
                    {customer.metrics.map((metric) => (
                      <Stat key={metric.label} value={metric.value} label={metric.label} />
                    ))}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
