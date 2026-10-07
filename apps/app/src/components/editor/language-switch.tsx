'use client';

import { LanguagesIcon } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@achar/ui';
import { languageName } from '@/lib/language';

/**
 * Which language the editor is showing.
 *
 * A select rather than a row of tabs, because a dataset may hold six languages and
 * a bar is not the place to find out. What it shows per language is the one thing an
 * editor needs before choosing: **how much of this document is not written in it** —
 * the count is the point of the control, and a language with nothing missing says
 * nothing rather than saying "0".
 *
 * A count is a count of *fields*, not of words: it comes from the same walk the API
 * uses to decide what a reader would be shown, so the number here and the fallback
 * the site performs are the same fact read twice.
 */
export function LanguageSwitch({
  languages,
  defaultLanguage,
  value,
  missing,
  onChange,
}: {
  languages: readonly string[];
  defaultLanguage: string;
  /** The language on screen. */
  value: string;
  /** Fields with no value in each language, by code — what the switch reports. */
  missing: Record<string, number>;
  onChange: (language: string) => void;
}) {
  // One language is not a choice, and a select that cannot change anything is
  // furniture in a bar that has real buttons to draw.
  if (languages.length < 2) return null;

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className="h-8 w-auto gap-1.5 px-2 text-xs"
        aria-label="Language"
        title="Which language the fields below are edited in"
      >
        <LanguagesIcon className="size-3.5 shrink-0" />
        <SelectValue />
      </SelectTrigger>

      <SelectContent align="end">
        {languages.map((code) => {
          const gaps = missing[code] ?? 0;
          return (
            <SelectItem key={code} value={code} className="text-xs">
              {languageName(code)}
              {code === defaultLanguage ? (
                <span className="text-muted-foreground"> · default</span>
              ) : null}
              {gaps > 0 ? (
                <span className="text-muted-foreground">
                  {' '}
                  · {gaps} not written
                </span>
              ) : null}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
