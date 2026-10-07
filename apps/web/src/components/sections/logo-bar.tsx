import type { Customer } from '@/content/types';

/**
 * The names, under the claim.
 *
 * Wordmarks rather than logos, letter-spaced rather than set in a typeface we do
 * not have the rights to: a customer's logo is their property and a marketing
 * site that redraws one is a marketing site with a legal problem. What a visitor
 * reads here is *who*, and the letters say that as well as the mark does.
 */
export function LogoBar({ customers }: { customers: Customer[] }) {
  if (customers.length === 0) return null;

  return (
    <section className="border-b border-border/60 bg-muted/20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">
          Trusted by teams at
        </p>

        <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {customers.map((customer) => (
            <li
              key={customer.id}
              className="text-lg font-medium uppercase tracking-widest text-muted-foreground/80"
            >
              {customer.name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
