/**
 * App-local widenings of the contract.
 *
 * `@achar/types` is the shape every surface agrees on, and it is deliberately
 * the answer to "what is a document here" rather than a form's payload. Two
 * things the studio sends are wider than the read shape — a project's
 * description, which `PATCH /v1/projects/{p}` writes and `Project` does not
 * carry — and saying so once, here, beats a cast at each call site.
 */

import type { Project } from '@achar/types';

/** A project as the studio writes it: the list shape plus the description settings hold. */
export type ProjectSettings = Project & { description?: string | null };

export function descriptionOf(project: Project): string {
  const settings = project as ProjectSettings;
  return typeof settings.description === 'string' ? settings.description : '';
}
