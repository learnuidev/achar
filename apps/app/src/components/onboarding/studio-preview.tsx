import { defaultSchema, documentTypes } from '@achar/schema';
import { AcharMark, cn } from '@achar/ui';
import { iconFor } from '@/lib/icons';

/**
 * The project the flow is making, drawn a piece at a time.
 *
 * It is a window rather than an illustration because the thing being made is a
 * window: a project, a dataset inside it, and the document types that dataset
 * accepts. So every part of this comes from an answer rather than from a drawing —
 * pick what you are building and the type list appears, type a project name and it
 * becomes the title, name the dataset and the content area fills in. Somebody who
 * answers all four has seen the shape of what they are about to open before they
 * have opened it.
 *
 * The types are Achar's own content model, read from `@achar/schema` rather than
 * copied here: the default schema *is* what a new dataset is authored against — the
 * API answers it when a dataset has no schema row of its own — so a list written
 * out by hand in this file would be a preview of something that does not exist.
 */

/** The document types of the default model, by name, in the order asked for. */
function typesNamed(names: readonly string[]) {
  const model = documentTypes(defaultSchema());
  return names.flatMap((name) => model.filter((type) => type.name === name));
}

export interface StudioPreviewProps {
  /** The project's organization, or empty while it is still being asked for. */
  organization: string;
  /** The project's name as it is typed. */
  projectName: string;
  /** The dataset's name, once the flow has got that far — `null` before then. */
  dataset: string | null;
  /** The document types this dataset starts with, from what was picked first. */
  types: readonly string[];
}

export function StudioPreview({ organization, projectName, dataset, types }: StudioPreviewProps) {
  const shown = typesNamed(types);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* The title bar: the project's name, and who it belongs to on the right. */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span aria-hidden className="size-3 shrink-0 rounded-sm bg-primary/60" />
        <span
          className={cn(
            'truncate text-sm font-medium',
            projectName ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {projectName || 'Your project'}
        </span>
        {organization && (
          <span className="ml-auto truncate text-xs text-muted-foreground">{organization}</span>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-6 text-center">
          <AcharMark className="size-8 opacity-40" />
          <p className="max-w-56 text-xs text-muted-foreground">
            Your project is drawn here as you answer — its name, its dataset, and the types you
            will be able to write.
          </p>
        </div>
      ) : (
        <div className="flex min-h-80">
          {/* What the studio draws for a dataset: the name, then its types. */}
          <div className="w-40 shrink-0 border-r border-border p-3">
            <p
              className={cn(
                'truncate px-2 font-mono text-xs',
                dataset ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {dataset || 'no dataset yet'}
            </p>
            <ul className="mt-3 space-y-0.5">
              {shown.map((type) => {
                const Icon = iconFor(type.icon);
                return (
                  <li
                    key={type.name}
                    className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground"
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate">{type.title}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* The content area: a wireframe until there is a dataset to hold it. */}
          <div className="min-w-0 flex-1 space-y-3 p-4">
            {dataset ? (
              [0, 1, 2].map((row) => (
                <div key={row} className="space-y-2 rounded-lg border border-border p-3">
                  <div className="h-2 w-1/2 rounded-full bg-muted-foreground/30" />
                  <div className="h-2 w-3/4 rounded-full bg-muted" />
                  <div className="h-2 w-1/3 rounded-full bg-muted" />
                </div>
              ))
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="max-w-56 text-center text-xs text-muted-foreground">
                  Documents and assets live in a dataset. Its types are on the left — they are what
                  the editor will offer you.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
