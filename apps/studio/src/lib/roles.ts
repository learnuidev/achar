/**
 * The three roles, in the words the studio uses for them.
 *
 * The model itself is `@achar/types`'; what lives here is the sentence beside
 * each one in a picker, because "what may a viewer do" is the only question
 * anybody asks when they are choosing one.
 */

import type { ProjectRole } from '@achar/types';

export function roleLabel(role: ProjectRole): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export function roleDescription(role: ProjectRole): string {
  switch (role) {
    case 'ADMIN':
      return 'Manages the project and its members, and everything an editor can do.';
    case 'EDITOR':
      return 'Reads and writes documents, assets and the schema.';
    case 'VIEWER':
      return 'Reads everything, changes nothing.';
  }
}

/** Whether this role may write content — the check every editing control asks. */
export function canEdit(role: ProjectRole | null | undefined): boolean {
  return role === 'ADMIN' || role === 'EDITOR';
}

/** Whether this role may manage the project and its people. */
export function canAdmin(role: ProjectRole | null | undefined): boolean {
  return role === 'ADMIN';
}
