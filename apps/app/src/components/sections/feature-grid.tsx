import { FeatureCard } from '@/components/content/feature-card';
import { FEATURE_GROUPS, FEATURE_GROUP_TITLES, type Feature, type FeatureGroup } from '@/content/types';

/**
 * Every `feature` document, grouped by the document's own `group` field.
 *
 * The grouping is read from the corpus rather than written here, which is what
 * lets the marketing team move a card between columns in the studio without a
 * deploy. What is written here is the heading each group gets and the sentence
 * under it — a group is a claim about the product, and that part is copy.
 */
const GROUP_BLURBS: Record<FeatureGroup, string> = {
  content: 'Model it, author it, and keep what you are working on away from what is live.',
  platform: 'Query it, deliver it at the edge, and keep every channel reading the same source.',
  ai: 'Hand agents and models the same typed content your pages are rendered from.',
};

export function FeatureGrid({ features }: { features: Feature[] }) {
  const groups = FEATURE_GROUPS.map((group) => ({
    group,
    title: FEATURE_GROUP_TITLES[group],
    blurb: GROUP_BLURBS[group],
    items: features.filter((feature) => feature.group === group),
  })).filter((section) => section.items.length > 0);

  if (groups.length === 0) return null;

  return (
    <section id="features" className="border-b border-border/60">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">The platform</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything between a draft and a hundred channels.
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Twelve pieces, one system. They are listed in the order a project grows into them — the
            first three are what you need on day one, and the last are what you need once there are
            three frontends and a migration.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-14">
          {groups.map((section) => (
            <div key={section.group} id={`group-${section.group}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 pb-4">
                <h3 className="text-xl font-medium tracking-tight">{section.title}</h3>
                <p className="max-w-xl text-sm text-muted-foreground">{section.blurb}</p>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {section.items.map((feature) => (
                  <FeatureCard key={feature.id} feature={feature} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
