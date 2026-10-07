/**
 * Four numbers, on the one band of colour on the page.
 *
 * Written here rather than read from the corpus because they are properties of
 * the platform, not of a customer — the median query time, the delivery uptime,
 * what a dataset holds. A customer's own numbers live on their document and are
 * rendered beside their quote; these are the ones that would be the same on
 * anybody's site.
 *
 * The band is `bg-primary` because it is the one place on the page where the eye
 * is meant to stop without being asked to click anything.
 */
const STATS = [
  { value: '18 ms', label: 'Median cached query, from the nearest edge' },
  { value: '99.99%', label: 'Content delivery availability, trailing 12 months' },
  { value: '4B', label: 'Documents served from Achar datasets this year' },
  { value: '2,400+', label: 'Teams publishing through a content lake' },
] as const;

export function StatsBand() {
  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => (
            <li key={stat.label} className="flex flex-col gap-2">
              <span className="text-4xl font-semibold tracking-tight sm:text-5xl">{stat.value}</span>
              <span className="text-sm text-primary-foreground/80">{stat.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
