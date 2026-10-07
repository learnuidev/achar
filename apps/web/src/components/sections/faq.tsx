'use client';

import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@achar/ui';
import type { Faq } from '@/content/types';

/**
 * The questions, as an accordion.
 *
 * Hand-built from a `button`, `aria-expanded` and a conditional panel rather than
 * pulled from a disclosure library: an accordion is a button and a region, the
 * accessibility it needs is three attributes, and a dependency that draws it for
 * you is a dependency that has to be kept working for a page whose whole job is
 * to be a static document.
 *
 * One panel is open at a time, and the first question starts open — a page of
 * eight closed rows reads as a page of eight things you are not allowed to know.
 */
export function FaqSection({
  faqs,
  eyebrow = 'Questions',
  title = 'The things teams ask before they move.',
}: {
  faqs: Faq[];
  eyebrow?: string;
  title?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);
  if (faqs.length === 0) return null;

  return (
    <section id="faq" className="scroll-mt-24 border-b border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <p className="text-xs font-medium uppercase tracking-widest text-primary">{eyebrow}</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Everything below is a document in the dataset this page renders — the question, the
            answer, and the order they appear in.
          </p>
        </div>

        <div className="lg:col-span-2">
          <ul className="divide-y divide-border border-y border-border">
            {faqs.map((faq) => {
              const isOpen = faq.id === openId;

              return (
                <li key={faq.id}>
                  <h3>
                    <button
                      type="button"
                      id={`faq-trigger-${faq.id}`}
                      aria-expanded={isOpen}
                      aria-controls={`faq-panel-${faq.id}`}
                      onClick={() => setOpenId(isOpen ? null : faq.id)}
                      className="flex w-full items-center gap-4 py-5 text-left text-base font-medium transition-colors hover:text-primary"
                    >
                      {faq.question}
                      <ChevronDownIcon
                        aria-hidden
                        className={cn(
                          'ml-auto size-4 shrink-0 text-muted-foreground transition-transform',
                          isOpen && 'rotate-180',
                        )}
                      />
                    </button>
                  </h3>

                  <div
                    id={`faq-panel-${faq.id}`}
                    role="region"
                    aria-labelledby={`faq-trigger-${faq.id}`}
                    hidden={!isOpen}
                    className="pb-6 pr-8 text-sm leading-relaxed text-muted-foreground"
                  >
                    {faq.answer}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
