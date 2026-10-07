import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@achar/ui';
import { FeatureCard } from '@/components/content/feature-card';
import { FinalCta } from '@/components/sections/final-cta';
import { Integrations } from '@/components/sections/integrations';
import { SplitFeatures } from '@/components/sections/split-features';
import { getFeatures, getIntegrations, getSiteSettings } from '@/content';
import { FEATURE_GROUPS, FEATURE_GROUP_TITLES } from '@/content/types';

/**
 * The platform tour.
 *
 * The homepage argues; this page explains. It is where somebody who has already
 * decided the shape of the thing is right goes to find out whether the details
 * are, so it is longer, more concrete, and organised around the five parts of the
 * system rather than around the visitor's objections.
 *
 * The section anchors (`#lake`, `#groq`, `#studio`, `#realtime`, `#cdn`) are the
 * targets of the footer's links, which is why they are ids on the sections rather
 * than just headings.
 */
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  return {
    title: 'Product',
    description: `How ${settings.title} works: the content lake, GROQ, the studio, real-time collaboration, and delivery from the edge.`,
  };
}

export default async function ProductPage() {
  const [settings, features, integrations] = await Promise.all([
    getSiteSettings(),
    getFeatures(),
    getIntegrations(),
  ]);

  const groups = FEATURE_GROUPS.map((group) => ({
    group,
    title: FEATURE_GROUP_TITLES[group],
    items: features.filter((feature) => feature.group === group),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-border/60">
        <div aria-hidden className="achar-grid absolute inset-0 -z-10 opacity-60" />
        <div className="mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-24">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">Product</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            A content lake, a query language, and a studio that authors against both.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            {settings.description}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link href={settings.primaryCta.href}>
                {settings.primaryCta.label}
                <ArrowRightIcon />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>

      <SplitFeatures />

      <section id="capabilities" className="scroll-mt-24 border-b border-border/60 bg-muted/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Capabilities</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything the platform does, in three groups.
            </h2>
            <p className="mt-5 text-lg text-muted-foreground">
              Content is what you model and author. Platform is what reads, guards and delivers it.
              AI is what the same structured content makes possible — and it is a third group rather
              than a headline because it is a consequence of the first two, not a replacement for
              them.
            </p>
          </div>

          <Tabs defaultValue={groups[0]?.group ?? 'content'} className="mt-12">
            <TabsList>
              {groups.map((section) => (
                <TabsTrigger key={section.group} value={section.group}>
                  {section.title}
                </TabsTrigger>
              ))}
            </TabsList>

            {groups.map((section) => (
              <TabsContent key={section.group} value={section.group} className="mt-8">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {section.items.map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} />
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </section>

      <Integrations integrations={integrations} />
      <FinalCta primaryCta={settings.primaryCta} secondaryCta={settings.secondaryCta} />
    </>
  );
}
