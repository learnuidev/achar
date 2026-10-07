/**
 * Reading a schema, and the small questions the studio asks it constantly.
 *
 * None of this is schema *behaviour* — validation, initial values and preview
 * titles all come from `@achar/schema`. These are the shapes of the menu, the
 * labels beside a field, and the answer to "which tab is this field on", which
 * belong to the surface drawing the schema rather than to the schema itself.
 */

import type { SchemaField, SchemaType } from '@achar/types';
import type { SchemaIssue } from '@achar/schema';
/** A field's title, or one made from its name when the schema gave none. */
export function fieldTitle(field: SchemaField): string {
  return field.title || field.name;
}

/** The fields a form draws, in the order the schema declared them. */
export function visibleFields(fields: SchemaField[]): SchemaField[] {
  return fields.filter((field) => !field.hidden);
}

/**
 * The tabs a document's fields are split across.
 *
 * A type that declares no groups gets one unnamed tab, which is not a tab in
 * the UI — a single tab is a bar with one button on it, and the form draws
 * straight down the page instead. Fields naming a group that the type never
 * declared land in the first tab rather than nowhere, because a field nobody
 * can reach is indistinguishable from a field nobody can save.
 */
export interface FieldGroup {
  name: string;
  title: string;
  fields: SchemaField[];
}

export const UNGROUPED = '';

export function fieldGroups(type: SchemaType): FieldGroup[] {
  const fields = visibleFields(type.fields);
  const declared = type.groups ?? [];
  if (declared.length === 0) {
    return [{ name: UNGROUPED, title: 'Content', fields }];
  }

  const groups: FieldGroup[] = declared.map((group) => ({
    name: group.name,
    title: group.title,
    fields: fields.filter((field) => field.group === group.name),
  }));

  // Fields with no group, or a group nobody declared, ride along in the first
  // tab. They are still fields of this document.
  const names = new Set(declared.map((group) => group.name));
  const strays = fields.filter((field) => !field.group || !names.has(field.group));
  if (strays.length > 0) {
    const first = groups[0];
    if (first) groups[0] = { ...first, fields: [...first.fields, ...strays] };
  }

  return groups.filter((group) => group.fields.length > 0);
}

/** True when the type's fields really are split, and a tab bar is worth drawing. */
export function hasGroups(type: SchemaType): boolean {
  return (type.groups?.length ?? 0) > 1;
}

/**
 * The document types a dataset lists.
 *
 * An `object` type is only ever a field of a document, so it is not a list
 * nobody has filled in — it is not a list at all. `@achar/schema` answers this
 * for a whole `DatasetSchema`; this is the same question asked of the array the
 * rail already has in hand.
 */
export function documentTypesOf(types: SchemaType[]): SchemaType[] {
  return types.filter((type) => type.kind === 'document');
}

export function findType(types: SchemaType[], name: string | undefined): SchemaType | null {
  if (!name) return null;
  return types.find((type) => type.name === name) ?? null;
}

/** `title` → `Title`, the label a right-hand panel puts on a path. */
export function labelForPath(type: SchemaType, path: string): string {
  const [head] = path.split(/[.[]/);
  const field = type.fields.find((candidate) => candidate.name === head);
  return field ? fieldTitle(field) : path;
}

/**
 * Whether a validation issue belongs to a field.
 *
 * Paths come back in the schema's own dialect — `links.0.label`,
 * `body[0].children` — so both sides are reduced to their leading name before
 * they are compared. A panel that highlights nothing because the schema writes
 * its paths differently from the way the form reads them would be a validation
 * panel nobody trusts.
 */
export function issueTouchesField(issuePath: string, fieldName: string): boolean {
  const head = issuePath.split(/[.[]/)[0];
  return head === fieldName;
}

/** The fields whose values a preview pane can show as text. */
export function isReadableField(field: SchemaField): boolean {
  return ['string', 'text', 'slug', 'url', 'email', 'number', 'boolean', 'datetime', 'date'].includes(
    field.type,
  );
}

/**
 * The value a control starts with, for a field the form has never seen.
 *
 * `initialDocument` answers this for a whole document; this is the same question
 * asked of one field, which is what adding an item to an array needs. A field
 * with no sensible empty value — a reference, an asset, portable text — starts
 * as `null` or `[]` rather than as an empty string, because the API's validation
 * distinguishes them and a placeholder string would be saved as content.
 */
export function initialForField(field: SchemaField): unknown {
  if (field.initialValue !== undefined) return field.initialValue;

  switch (field.type) {
    case 'string':
    case 'text':
    case 'slug':
    case 'url':
    case 'email':
    case 'datetime':
    case 'date':
      return '';
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object':
      return Object.fromEntries((field.fields ?? []).map((nested) => [nested.name, initialForField(nested)]));
    case 'portableText':
      return [];
    case 'image':
    case 'file':
    case 'reference':
      return null;
  }
}

/**
 * The issues that belong to a field or to anything inside it.
 *
 * A path runs through a list — `links[0].href` — so a field's own issues and its
 * items' issues are different strings for the same control, and a panel that
 * highlighted only the exact path would say a list is fine while a row inside it
 * is not.
 */
export function issuesAt(issues: SchemaIssue[], path: string): SchemaIssue[] {
  return issues.filter(
    (issue) => issue.path === path || issue.path.startsWith(`${path}.`) || issue.path.startsWith(`${path}[`),
  );
}

export function hasIssueAt(issues: SchemaIssue[], path: string): boolean {
  return issuesAt(issues, path).length > 0;
}
