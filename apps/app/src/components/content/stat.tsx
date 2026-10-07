import { cn } from '@achar/ui';

/**
 * One number, at the size a number is read at.
 *
 * The `value` is a string rather than a number because it is a document field and
 * because the interesting ones are not numbers: `4×`, `99.99%`, `18ms`, `<50`.
 * Anything that parses them into a float is a component that decides which
 * customers are allowed to have interesting metrics.
 */
export function Stat({
  value,
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
