import Link from 'next/link';
import { Button } from '@achar/ui';
import { routes } from '@/lib/routes';

/**
 * A 404 in the studio's voice.
 *
 * A studio's URLs are long and full of ids, which means most of the 404s here
 * are a link that was right yesterday: a dataset renamed, a document deleted, a
 * project somebody was removed from. So the page explains the commonest cause
 * instead of blaming the reader, and points at the one place that is always
 * valid.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">There is nothing at this address</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Studio links carry a project, a dataset and often a document id, so a link that worked
        yesterday stops working when one of those is renamed or deleted — or when somebody stops
        being a member of the project it pointed at.
      </p>
      <div className="flex items-center gap-2">
        <Button asChild>
          <Link href={routes.projectPicker()}>Your projects</Link>
        </Button>
      </div>
    </div>
  );
}
