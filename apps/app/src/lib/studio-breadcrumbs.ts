import type { SchemaType } from '@achar/types';

import { humanizeType } from '@/lib/format';
import { base, routes } from '@/lib/routes';

/**
 * The trail in the studio's top bar.
 *
 * A studio is deep — four segments between the front door and a paragraph — so the
 * bar carries the whole trail rather than a title. This builds it from the path.
 *
 * **Everything here counts from after `/studio`.** `base` is the studio's own
 * prefix, and the two literal segments under it (`projects`, then the project's id)
 * come before the dataset. A version of this that indexed the path from its root
 * pointed every crumb at `/studio/projects/projects` and called the dataset
 * "Production" — the path was one segment longer than the arithmetic assumed, and
 * the arithmetic was spread over four lines where that is hard to see.
 *
 * It is a function of the path rather than of a router's params because the bar is
 * drawn by the shell, which is above every page in the segment: the pages know
 * their own params, and the shell is the one thing that can see the whole URL.
 */
export interface Crumb {
  href: string;
  label: string;
}

/** The surfaces under a dataset, named the way the rail names them. */
const SECTIONS: Record<string, string> = {
  content: 'Content',
  assets: 'Assets',
  schema: 'Schema',
  api: 'API',
  members: 'Members',
};

export function studioBreadcrumbs({
  pathname,
  projectName,
  dataset,
  types,
}: {
  pathname: string;
  projectName: string;
  dataset: string;
  /** The dataset's schema, so a type crumb can carry its title rather than its name. */
  types: SchemaType[];
}): Crumb[] {
  // `/studio/projects/{projectId}/{dataset}/…`
  const prefix = base.split('/').filter(Boolean).length;
  const rest = pathname.split('/').filter(Boolean).slice(prefix);

  // `rest` is `['projects', projectId, dataset, section, …]`.
  const projectId = rest[1] ?? '';
  const section = rest[3];
  const tail = rest.slice(4);

  const trail: Crumb[] = [
    { href: routes.project(projectId), label: projectName },
    { href: routes.dataset(projectId, dataset), label: dataset },
  ];

  if (!section) return trail;

  if (section === 'content') {
    const typeName = tail[0] ?? '';
    const type = types.find((candidate) => candidate.name === typeName);

    trail.push({
      href: routes.content(projectId, dataset, typeName),
      label: type?.title || humanizeType(typeName) || 'Content',
    });

    // The document, named by its id: the editor's own bar carries its title, and
    // an id is what somebody matching the trail against the address bar needs. The
    // last crumb is the page they are on, and it is not a link.
    if (tail[1]) trail.push({ href: pathname, label: tail[1] });
    return trail;
  }

  trail.push({ href: pathname, label: SECTIONS[section] ?? humanizeType(section) });
  return trail;
}
