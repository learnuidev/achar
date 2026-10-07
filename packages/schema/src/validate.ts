import type { SchemaField, SchemaType } from '@achar/types';

/** One thing wrong with one value, at the path a form can point at. */
export interface SchemaIssue {
  path: string;
  message: string;
}

/**
 * Everything wrong with a value, rather than the first thing.
 *
 * A document that is refused four times for four reasons is a document somebody
 * has to press save four times to discover — so the walk finishes and the whole
 * list comes back, ordered by field and then by depth, which is the order a form
 * lists them in anyway.
 *
 * A field the schema does not declare is not an issue: content is open, a
 * migration may write a field before its schema is published, and the system
 * fields all begin `_` precisely so that they are nobody's to declare.
 */
export function validateDocument(type: SchemaType, value: unknown): SchemaIssue[] {
  if (!isRecord(value)) {
    return [{ path: '', message: `must be an object — ${type.name} fields are named properties` }];
  }

  const issues: SchemaIssue[] = [];
  for (const field of type.fields) {
    checkField(field, value[field.name], field.name, issues);
  }
  return issues;
}

function checkField(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  if (value === undefined || value === null) {
    if (field.required) issues.push({ path, message: 'is required' });
    return;
  }

  if (field.required && isBlank(value)) {
    issues.push({ path, message: 'must not be empty' });
    return;
  }

  switch (field.type) {
    case 'string':
    case 'text':
    case 'slug':
      checkPlainString(field, value, path, issues);
      return;
    case 'url':
      if (!isString(value)) {
        issues.push({ path, message: 'must be a URL' });
        return;
      }
      if (!isUrl(value)) issues.push({ path, message: 'must be a URL' });
      return;
    case 'email':
      if (!isString(value)) {
        issues.push({ path, message: 'must be an email address' });
        return;
      }
      if (!isEmail(value)) issues.push({ path, message: 'must be an email address' });
      return;
    case 'datetime':
    case 'date':
      if (!isString(value)) {
        issues.push({ path, message: 'must be a date' });
        return;
      }
      // Parsed rather than pattern-matched: `2025-02-31` matches every date
      // pattern anybody writes and is not a day, which is the sort of value only
      // a form ever produces.
      if (Number.isNaN(Date.parse(value))) issues.push({ path, message: 'must be a date' });
      return;
    case 'number':
      checkNumber(field, value, path, issues);
      return;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push({ path, message: 'must be true or false' });
      return;
    case 'image':
    case 'file':
      checkAsset(value, path, issues);
      return;
    case 'reference':
      checkReference(field, value, path, issues);
      return;
    case 'portableText':
      checkPortableText(value, path, issues);
      return;
    case 'array':
      checkArray(field, value, path, issues);
      return;
    case 'object':
      checkObject(field, value, path, issues);
      return;
  }
}

function checkPlainString(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  if (!isString(value)) {
    issues.push({ path, message: 'must be a string' });
    return;
  }
  if (field.options && !field.options.some((option) => option.value === value)) {
    const allowed = field.options.map((option) => option.value).join(', ');
    issues.push({ path, message: `must be one of ${allowed}` });
  }
}

function checkNumber(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push({ path, message: 'must be a number' });
    return;
  }
  if (field.min !== undefined && value < field.min) {
    issues.push({ path, message: `must be at least ${field.min}` });
  }
  if (field.max !== undefined && value > field.max) {
    issues.push({ path, message: `must be at most ${field.max}` });
  }
}

/**
 * An asset is a reference or a URL.
 *
 * Both are accepted because both are written: the studio stores what an upload
 * handed it — `{ _ref: 'image-…' }` — and a site migrating in from somewhere else
 * stores the address its images already have. Refusing the second would mean
 * every migration has to fetch and re-upload bytes it is already serving.
 */
function checkAsset(value: unknown, path: string, issues: SchemaIssue[]): void {
  if (isString(value)) {
    if (value === '') issues.push({ path, message: 'must not be empty' });
    return;
  }
  const reference = isRecord(value) ? value._ref : undefined;
  if (!isString(reference) || reference === '') {
    issues.push({ path, message: 'must be an asset reference (`_ref`) or a URL' });
  }
}

function checkReference(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  const target = referenceTarget(value);
  if (target === null) {
    issues.push({ path, message: 'must be a reference (`_ref`) or a document id' });
    return;
  }
  if (target === '') {
    issues.push({ path, message: 'must name a document' });
    return;
  }

  // The schema's `to` is checked only when the value itself says what it points
  // at. A reference is an id and nothing else, so a document type is not
  // something this function can know — but a `author->` dereference hands back
  // the whole document, and that one does say.
  const targetType = referenceTargetType(value);
  if (targetType && field.to?.length && !field.to.includes(targetType)) {
    issues.push({ path, message: `must point at ${field.to.join(' or ')}, not ${targetType}` });
  }
}

function checkPortableText(value: unknown, path: string, issues: SchemaIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be an array of portable text nodes' });
    return;
  }

  value.forEach((node, index) => {
    const nodePath = `${path}[${index}]`;
    if (!isRecord(node) || !isString(node._type)) {
      issues.push({ path: nodePath, message: 'must be a portable text node with a `_type`' });
      return;
    }
    if (node._type === 'block' && (!Array.isArray(node.children) || node.children.length === 0)) {
      issues.push({ path: nodePath, message: 'must have children' });
      return;
    }
    if (node._type === 'image') {
      const reference = isRecord(node.asset) ? node.asset._ref : undefined;
      if (!isString(reference) || reference === '') {
        issues.push({ path: nodePath, message: 'must have an `asset._ref`' });
      }
    }
  });
}

function checkArray(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: 'must be a list' });
    return;
  }
  if (field.min !== undefined && value.length < field.min) {
    issues.push({ path, message: `must have at least ${field.min}` });
  }
  if (field.max !== undefined && value.length > field.max) {
    issues.push({ path, message: `must have at most ${field.max}` });
  }

  const members = field.of ?? [];
  if (members.length === 0) return;

  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    const member = members.find((candidate) => accepts(candidate, item, itemPath));
    if (!member) {
      // A union of several: the item is refused with the list it had to be one
      // of, because the alternative is the last member's complaints about a
      // shape the author never meant to write.
      const names = members.map((candidate) => candidate.title || candidate.name).join(', ');
      issues.push({ path: itemPath, message: `must be one of ${names}` });
      return;
    }
    checkField(member, item, itemPath, issues);
  });
}

function checkObject(
  field: SchemaField,
  value: unknown,
  path: string,
  issues: SchemaIssue[],
): void {
  if (!isRecord(value)) {
    issues.push({ path, message: 'must be an object' });
    return;
  }
  for (const sub of field.fields ?? []) {
    checkField(sub, value[sub.name], `${path}.${sub.name}`, issues);
  }
}

/** Whether a field takes this value without complaint — what a union is chosen by. */
function accepts(field: SchemaField, value: unknown, path: string): boolean {
  const probe: SchemaIssue[] = [];
  checkField(field, value, path, probe);
  return probe.length === 0;
}

function referenceTarget(value: unknown): string | null {
  if (isString(value)) return value;
  if (!isRecord(value)) return null;
  if (isString(value._ref)) return value._ref;
  // A dereferenced document is still a reference that resolved; it simply no
  // longer carries the id it resolved from.
  if (isString(value._id)) return value._id;
  return null;
}

function referenceTargetType(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const type = value._type;
  return isString(type) && type !== 'reference' ? type : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isBlank(value: unknown): boolean {
  return value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * A URL, or a path this site serves.
 *
 * `/pricing` is what an author types into a link field and `new URL` refuses it,
 * so a check that only knew about absolute addresses would refuse every internal
 * link in the product.
 */
function isUrl(value: string): boolean {
  if (value.startsWith('/')) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
