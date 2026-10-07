import type { ReactNode, TextareaHTMLAttributes, InputHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * The form vocabulary, in the same voice as the rest of the console.
 *
 * Labels are small and muted, the control is a hairline on a tinted surface, and
 * the hint sits under the control rather than inside it — a hint that replaces
 * the placeholder is a hint that disappears the moment somebody types.
 */

export function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={htmlFor}>
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="text-muted-foreground text-xs leading-relaxed">{hint}</span>
      ) : null}
    </label>
  );
}

const CONTROL =
  "border-border bg-background/60 focus-visible:ring-ring w-full rounded-xl border px-3.5 py-2.5 font-mono text-sm transition-colors placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60";

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(CONTROL, className)} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(CONTROL, "resize-y leading-relaxed", className)} />;
}

/** A checkbox with a label beside it, for the two questions that are one bit. */
export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="border-border text-primary accent-destructive focus-visible:ring-ring mt-0.5 size-4 shrink-0 rounded focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50"
      />
      <span className="min-w-0">
        <span className="text-sm font-medium">{label}</span>
        {hint ? (
          <span className="text-muted-foreground mt-0.5 block text-xs leading-relaxed">
            {hint}
          </span>
        ) : null}
      </span>
    </label>
  );
}
