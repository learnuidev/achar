/**
 * The shapes the sign-in and sign-up screens share.
 *
 * Plain Tailwind classes and the tokens the apps already define, rather than
 * `@achar/ui`: the design system is what the signed-in product draws with, and
 * asking it to render the screen that gets somebody into that product would make
 * the two packages depend on each other.
 *
 * Shared between the two screens rather than written twice, because the one thing
 * a person should not be able to tell is which of the two they are looking at —
 * a field that is 40 pixels tall on one and 44 on the other is a product that
 * looks broken in a way nobody reports.
 */
export const fieldClass =
  'h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const primaryButtonClass =
  'inline-flex h-10 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50';

export const secondaryButtonClass =
  'inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-background text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50';

export const labelClass = 'text-sm font-medium';

export const cardClass =
  'w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-sm';
