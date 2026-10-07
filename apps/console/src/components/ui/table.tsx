import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * The table vocabulary, and nothing above it.
 *
 * Deliberately not a data grid. The console draws exactly two kinds of table —
 * a page of DynamoDB rows, whose columns are whatever the rows happen to
 * contain, and its own `EnvRow` lists — and both are read rather than operated:
 * no selection, no editing, no virtual scrolling. A grid library would be a
 * dependency and a state model bought to do nothing this app does, which is the
 * same reasoning `lib/cn.ts` gives for not merging class names.
 *
 * The head is a row of already-built cells rather than a column definition,
 * because the DynamoDB case genuinely does not know its columns until the rows
 * arrive: they are the union of the attributes in the page, sorted, and a
 * definition-shaped API would have to be given them anyway.
 */

export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border-border overflow-x-auto rounded-xl border", className)}>
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-muted/50">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function Tr({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "border-border border-t first:border-t-0",
        onClick && "hover:bg-accent/60 cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Th({
  children,
  className,
  title,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  onClick?: () => void;
}) {
  return (
    <th
      title={title}
      onClick={onClick}
      className={cn(
        "text-muted-foreground px-3 py-2 text-xs font-medium tracking-wide uppercase whitespace-nowrap",
        onClick && "hover:text-foreground cursor-pointer select-none",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td title={title} className={cn("px-3 py-2 align-top", className)}>
      {children}
    </td>
  );
}
