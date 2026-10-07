'use client';

import { useEffect, useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { cn } from '@achar/ui';

/**
 * A value a person has to carry somewhere else — an environment variable, a
 * token, an asset URL — drawn with the button that carries it.
 *
 * The confirmation is in place rather than a toast, because the thing being
 * confirmed is under the pointer: this row exists on screens where copying the
 * wrong line is expensive, and it is used most on the one screen — a secret
 * shown once — where a copy that silently failed is unrecoverable.
 *
 * **The value wraps rather than truncating.** These are values without spaces in
 * them — a token, a revision, an asset URL — and one line of them is wider than
 * any box they are drawn in: an ellipsis hid nineteen characters of a token in the
 * one place the token exists, and a row that clips the thing it is offering to copy
 * is a row that asks somebody to trust it. `break-all` is what breaks a string with
 * no break opportunity in it, which is exactly what these are.
 */
export function CopyRow({
  label,
  value,
  hint,
  className,
  mono = true,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // A page on a plain-HTTP origin has no clipboard; selecting the text by
      // hand is the fallback, and it needs no second UI.
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2',
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p
          className={cn(
            'mt-0.5 break-all text-sm',
            mono && 'font-mono text-xs',
            value ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {value || 'not set'}
        </p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>

      <button
        type="button"
        onClick={() => void copy()}
        disabled={!value}
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors',
          'hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        {copied ? <CheckIcon className="size-4 text-success" /> : <CopyIcon className="size-4" />}
      </button>
    </div>
  );
}

/** A copy button with no row around it, for a value already laid out somewhere. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
      {copied ? 'Copied' : label}
    </button>
  );
}
