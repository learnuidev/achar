import type { SchemaField, SchemaType } from '@achar/types';

import { humanise, scalarName } from './parse';

/**
 * Writing a schema back out as TypeScript.
 *
 * The other half of `parse.ts`, and the reason a content type is *editable*: the
 * editor holds TypeScript, and a type that was authored by hand or inferred from
 * a sample has to arrive in it as something a person can read and change. So this
 * is the inverse of the parser, and the pair are tested against each other —
 * print, then parse, and the fields have to be the fields.
 *
 * What it writes is the same subset the parser reads, and nothing more: a scalar
 * name, `[]` for a list, `|` for either, `?` for optional, and a nested `{ … }`.
 * A field's title and description go back as a JSDoc line above it, but only when
 * they say something a humanised name would not — a printed schema littered with
 * comments that repeat the field name is a schema nobody reads.
 */

/** The indentation of one level of nesting, which is a document's shape on screen. */
const INDENT = '  ';

/** Fields as the body of a declaration, one member per line. */
export function printFields(fields: SchemaField[], depth = 1): string {
  if (fields.length === 0) return '';

  return fields
    .map((field) => {
      const pad = INDENT.repeat(depth);
      const doc = printDoc(field, depth);
      return `${doc}${pad}${printMember(field)}`;
    })
    .join('\n');
}

/** A whole declaration, ready to go into the editor. */
export function printTypeDeclaration(type: SchemaType): string {
  const name = pascalCase(type.name) || 'Untitled';
  const doc = printTypeDoc(type);
  const body = printFields(type.fields, 1);
  const inner = body ? `\n${body}\n` : '';

  return `${doc}type ${name} = {${inner}}`;
}

/** One member: `title: string` or `publishedAt?: Date`. */
function printMember(field: SchemaField): string {
  return `${field.name}${field.required === false ? '?' : ''}: ${printShape(field)};`;
}

/**
 * What a field holds, as TypeScript.
 *
 * The order of the checks is the order the parser reads in: a closed set of
 * options before the scalar it is built on, because `'draft' | 'published'` is
 * more of a field's type than `string` is.
 */
function printShape(field: SchemaField): string {
  const inner = printInnerShape(field);
  // Outermost, and around the whole shape: `Localized<string[]>` is a list per
  // language, and `Localized<string>[]` — what wrapping only the scalar would
  // print — is a list whose items are each translated, which is a different field.
  return field.localized ? `Localized<${inner}>` : inner;
}

function printInnerShape(field: SchemaField): string {
  if (field.type === 'string' && field.options?.length) {
    return field.options.map((option) => quote(option.value)).join(' | ');
  }

  if (field.type === 'reference') {
    const targets = field.to ?? [];
    if (targets.length === 0) return 'string';
    return targets.map((target) => pascalCase(target)).join(' | ');
  }

  if (field.type === 'object') {
    const nested = printFields(field.fields ?? [], 2);
    if (!nested) return '{}';
    return `{\n${nested}\n${INDENT}}`;
  }

  if (field.type === 'array') {
    const items = field.of ?? [];
    // An `array` with no item shape is a list Achar never learned the contents
    // of, which only a hand-written schema has. `string[]` is the least wrong
    // thing to print, and the editor is where it gets fixed.
    if (items.length === 0) return 'string[]';
    // An item that is not required was written `(X | null)[]`, and printing it
    // without the null would print a list a document has to fill.
    const inner = items.map(
      (item) => `${printShape(item)}${item.required === false ? ' | null' : ''}`,
    );
    const union = inner.length === 1 ? inner[0]! : inner.join(' | ');
    // A union needs parentheses before `[]`: `A | B[]` is A, or a list of B, so
    // printing one without them prints a *different* type — which is what the
    // round trip in this pair is for. A reference to two types is such a union
    // even though it is a single item shape.
    const needsParens = inner.length > 1 || union.includes(' | ');
    return `${needsParens ? `(${union})` : union}[]`;
  }

  return scalarName(field.type);
}

/**
 * The comment above a field: its title when the title is a decision, its
 * description when there is one.
 *
 * A field called `publishedAt` with the title "Published at" is one a reader can
 * already read, so nothing is printed for it. The same field titled "Goes live"
 * has had somebody's thought put into it, and that thought is the one thing the
 * TypeScript cannot otherwise carry.
 */
function printDoc(field: SchemaField, depth: number): string {
  const pad = INDENT.repeat(depth);
  const title = field.title && field.title !== humanise(field.name) ? field.title : '';
  const description = (field.description ?? '').trim();

  if (!title && !description) return '';

  if (title && !description) return `${pad}/** ${title} */\n`;

  const lines = [title, ...description.split('\n')].filter(Boolean);
  const body = lines.map((line) => `${pad} * ${line}`).join('\n');
  return `${pad}/**\n${body}\n${pad} */\n`;
}

/** The comment above the declaration, from the type's own title and description. */
function printTypeDoc(type: SchemaType): string {
  const title = (type.title ?? '').trim();
  const description = (type.description ?? '').trim();
  const name = pascalCase(type.name);

  // The declaration's name already reads as the title in most cases, so a
  // comment repeating it is noise; a description is always worth printing.
  if (!description) return '';
  const lines = [title && title !== humanise(name) ? title : '', ...description.split('\n')].filter(
    Boolean,
  );
  return `/**\n${lines.map((line) => ` * ${line}`).join('\n')}\n */\n`;
}

/**
 * `pricingPlan` → `PricingPlan`, and `post` → `Post`.
 *
 * The inverse of the parser's own lowering, so that what the editor shows and
 * what gets stored stay one name apart in one letter — which is the whole of what
 * a schema round trip through this pair is allowed to change.
 */
export function pascalCase(written: string): string {
  const trimmed = written.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** A string literal in a union: quoted with single quotes, which is what a schema reads as. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "\\'")}'`;
}
