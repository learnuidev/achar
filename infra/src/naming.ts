/**
 * Turning the keys in the service table into names.
 *
 * A function key is a string like `list-documents` or `create-webhook`, and it
 * turns up in three places that each want a different shape: a Lambda name
 * (`achar-dev-list-documents`), a CloudFormation logical id
 * (`ListDocumentsFunction`) and, for a table, a name
 * (`achar-dev-documents-table`). Deriving all three from one key is what makes a
 * rename a one-place change and a search a single string.
 */

/** `DocumentsTable` → `documents-table`. */
export function kebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

/** `list-documents` → `ListDocuments`. */
export function pascal(key: string): string {
  return key
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

/**
 * A table's physical name, for a stage that creates its own.
 *
 * Only used when `ownership.tables` is true. A stage that imports its tables
 * names them in `existing.tables`, which is a physical name rather than a choice
 * — see the config's own note.
 */
export function tableName(stage: string, tableId: string): string {
  return `achar-${stage}-${kebab(tableId)}`;
}

/** A Lambda's deployed name. What a log group and a metric are searched by. */
export function functionName(stage: string, key: string): string {
  return `achar-${stage}-${key}`;
}

/**
 * A path segment that is safe in an API Gateway route.
 *
 * API Gateway takes `{name}` braces, so a path in the service table is written
 * with braces and used verbatim; this only guards against a stray leading slash
 * turning `GET /v1/projects` into `GET //v1/projects`, which API Gateway accepts
 * and then never matches.
 */
export function routePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
