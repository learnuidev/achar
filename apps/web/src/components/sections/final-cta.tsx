import Link from 'next/link';
import { ArrowRightIcon } from 'lucide-react';
import { Button } from '@achar/ui';
import type { Cta } from '@/content/types';

/**
 * The last band, full-bleed and in the one colour that means "press this".
 *
 * One action, and one sentence under it. Everything a visitor could still be
 * deciding was answered above; this is the part that stops asking them to decide
 * and offers the smallest next step there is — create a project and look at it.
 */
export function FinalCta({ primaryCta, secondaryCta }: { primaryCta?: Cta; secondaryCta?: Cta }) {
  const primary = primaryCta ?? { label: 'Start building', href: '/product' };

  return (
    <section className="bg-primary text-primary-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Your content already wants to be structured.
          </h2>
          <p className="mt-5 text-lg text-primary-foreground/85">
            Make a project, define a type, publish a document. The first three things you need are
            free, and the query you write for them is the same query you will be writing in three
            years.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button asChild size="lg" variant="secondary">
            <Link href={primary.href}>
              {primary.label}
              <ArrowRightIcon />
            </Link>
          </Button>

          {secondaryCta ? (
            <Link
              href={secondaryCta.href}
              className="text-sm text-primary-foreground/90 underline-offset-4 hover:underline"
            >
              {secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
