import { CoreIdea } from '@/components/sections/core-idea';
import { CustomerProof } from '@/components/sections/customer-proof';
import { FaqSection } from '@/components/sections/faq';
import { FeatureGrid } from '@/components/sections/feature-grid';
import { FinalCta } from '@/components/sections/final-cta';
import { Hero } from '@/components/sections/hero';
import { Integrations } from '@/components/sections/integrations';
import { LogoBar } from '@/components/sections/logo-bar';
import { PricingPreview } from '@/components/sections/pricing-preview';
import { SplitFeatures } from '@/components/sections/split-features';
import { StatsBand } from '@/components/sections/stats-band';
import {
  getCustomers,
  getFaqs,
  getFeatures,
  getIntegrations,
  getPricingPlans,
  getSiteSettings,
} from '@/content';

/**
 * The front page.
 *
 * Eleven sections in the order an argument is made in: the claim, who already
 * believes it, what the thing actually is, what it does, what it is like to use,
 * who it worked for, how much of it there is, what it connects to, what it costs,
 * what is still unclear, and the door.
 *
 * Every read happens in one `Promise.all` at the top, and every section below is
 * handed documents rather than fetching its own. Six parallel reads of one
 * dataset is one round trip's worth of latency; a section that fetches for itself
 * is a waterfall, and a waterfall is what a front page cannot afford.
 *
 * The footer is not here: it is in the root layout, because it is on every page.
 */
export const revalidate = 300;

export default async function HomePage() {
  const [settings, features, customers, plans, faqs, integrations] = await Promise.all([
    getSiteSettings(),
    getFeatures(),
    getCustomers(),
    getPricingPlans(),
    getFaqs(),
    getIntegrations(),
  ]);

  return (
    <>
      <Hero settings={settings} />
      <LogoBar customers={customers} />
      <CoreIdea />
      <FeatureGrid features={features} />
      <SplitFeatures include={['studio', 'realtime', 'cdn']} />
      <CustomerProof customers={customers} />
      <StatsBand />
      <Integrations integrations={integrations} />
      <PricingPreview plans={plans} />
      <FaqSection faqs={faqs} />
      <FinalCta primaryCta={settings.primaryCta} secondaryCta={settings.secondaryCta} />
    </>
  );
}
