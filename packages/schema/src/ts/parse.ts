import type { SchemaField, SchemaFieldType } from '@achar/types';

import { defineField } from '../dsl';

/**
 * Reading TypeScript as a schema.
 *
 * A dataset's content types are written as TypeScript declarations, because that
 * is the language the people who model content here already think in and the one
 * their editors understand:
 *
 * ```ts
 * type Post = {
 *   title: string;
 *   /** Shown under the title in a list. *​/
 *   excerpt?: string;
 *   cover: Image;
 *   publishedAt: Date;
 *   tags: string[];
 *   status: 'draft' | 'published';
 *   author: Author;
 *   body: PortableText;
 * }
 * ```
 *
 * What this reads is a **subset**, and it says so the way the GROQ implementation
 * does: one object type literal whose members are fields, `?` for optional, `[]`
 * for a list, `|` for either, and Achar's own vocabulary of names for the scalars.
 * Anything outside the subset is an *issue with a position* rather than a silently
 * invented field — a schema that quietly dropped a field is a form that quietly
 * cannot edit it.
 *
 * The scalar names are the one thing worth learning:
 *
 * | Written | A field that holds |
 * | --- | --- |
 * | `string`, `text` | a line, or a paragraph |
 * | `number`, `boolean` | a number, a switch |
 * | `Date` | a moment — what a publish time is |
 * | `date` | a day, with no time in it |
 * | `Slug`, `Url`, `Email` | a string that is checked |
 * | `Image`, `Video`, `File` | an asset |
 * | `PortableText` | rich text |
 * | `'a' \| 'b'` | one of those, as a picker |
 * | `{ … }` | a nested object |
 * | `SomeType` | a reference to a document of that type |
 *
 * Every other identifier is a reference, which is why `author: Author` needs no
 * annotation: naming a type *is* pointing at one. `Date` is capitalised on purpose
 * and `date` is not — the first is TypeScript's own, which is a moment in time,
 * and the second is Achar's, which is a day.
 */

/** Somewhere in the source, so the editor can put a caret under the line. */
export interface TsIssue {
  line: number;
  column: number;
  message: string;
}

export interface ParsedDeclaration {
  /**
   * The name an Achar type goes by: the declared name with a lowercase first
   * letter, so `PricingPlan` is `pricingPlan`.
   *
   * Lowercase because these names are *data*: they are in every document's
   * `_type` and in every query somebody writes by hand, and `*[_type ==
   * "PricingPlan"]` is a query carrying a capital for no reason the person typing
   * it can see. The declaration stays PascalCase, because that is what TypeScript
   * wants.
   */
  name: string;
  /** A title to start from: the JSDoc line above the declaration, or the name humanised. */
  title: string;
  description: string;
  fields: SchemaField[];
  issues: TsIssue[];
}

/** The words Achar reads as scalars, by the lowercased name written in a schema. */
const SCALARS: Record<string, SchemaFieldType> = {
  string: 'string',
  text: 'text',
  number: 'number',
  boolean: 'boolean',
  // Achar's own `datetime`, spelled out for anybody who would rather not rely on
  // the capital `Date`.
  datetime: 'datetime',
  day: 'date',
  slug: 'slug',
  url: 'url',
  uri: 'url',
  email: 'email',
  image: 'image',
  video: 'video',
  file: 'file',
  portabletext: 'portableText',
};

/**
 * The two words where case carries meaning, checked before the table above.
 *
 * `Date` is TypeScript's, and a date in TypeScript has a time in it. `date` is
 * lowercased and therefore Achar's, which is a day with nothing smaller in it.
 */
const BY_CASE: Record<string, SchemaFieldType> = {
  Date: 'datetime',
  date: 'date',
};

/**
 * What each scalar is called when it is written down again.
 *
 * The inverse of the two tables above, kept beside them so that reading and
 * printing cannot drift: a schema that goes into the editor and comes back out
 * has to be the schema it was, or every visit rewrites it.
 */
const SCALAR_NAMES: Record<SchemaFieldType, string> = {
  string: 'string',
  text: 'text',
  number: 'number',
  boolean: 'boolean',
  datetime: 'Date',
  date: 'date',
  slug: 'Slug',
  url: 'Url',
  email: 'Email',
  image: 'Image',
  video: 'Video',
  file: 'File',
  portableText: 'PortableText',
  reference: 'Reference',
  array: 'string[]',
  object: '{}',
};

/** How a scalar of this type is written in TypeScript. */
export function scalarName(type: SchemaFieldType): string {
  return SCALAR_NAMES[type];
}

/** Whether a word is one of Achar's own scalar names rather than a reference. */
export function isScalarName(written: string): boolean {
  return written in BY_CASE || written.toLowerCase() in SCALARS;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

type TokenKind = 'name' | 'string' | 'number' | 'doc' | 'punct' | 'end';

interface Token {
  kind: TokenKind;
  text: string;
  offset: number;
}

const PUNCTUATION = new Set([
  '{', '}', '[', ']', '(', ')', '<', '>', ':', ';', ',', '?', '|', '&', '=', '.',
]);

/**
 * The source as tokens, with comments kept.
 *
 * Kept because a JSDoc line is where a field's title comes from, and a form whose
 * every label is machine-humanised reads like a database table.
 */
function tokenize(source: string): { tokens: Token[]; issues: TsIssue[] } {
  const tokens: Token[] = [];
  const issues: TsIssue[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index);
      const text = source.slice(index + 2, end === -1 ? undefined : end).trim();
      tokens.push({ kind: 'doc', text, offset: index });
      index = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) {
        issues.push(at(source, index, 'This comment is never closed'));
        break;
      }
      // The `*` down the left of every line is the comment's furniture, not its
      // text, and a field titled "* Shown under the title" would be a bug.
      const text = source
        .slice(index + 2, end)
        .split('\n')
        .map((line) => line.replace(/^\s*\*?\s?/, '').trimEnd())
        .join('\n')
        .trim();
      tokens.push({ kind: 'doc', text, offset: index });
      index = end + 2;
      continue;
    }

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      const closed = source.indexOf(char, index + 1);
      if (closed === -1) {
        issues.push(at(source, index, 'This string is never closed'));
        break;
      }
      tokens.push({ kind: 'string', text: source.slice(index + 1, closed), offset: index });
      index = closed + 1;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = index;
      while (end < source.length && /[A-Za-z0-9_$]/.test(source[end]!)) end += 1;
      tokens.push({ kind: 'name', text: source.slice(index, end), offset: index });
      index = end;
      continue;
    }

    if (/[0-9]/.test(char)) {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end]!)) end += 1;
      tokens.push({ kind: 'number', text: source.slice(index, end), offset: index });
      index = end;
      continue;
    }

    if (PUNCTUATION.has(char)) {
      tokens.push({ kind: 'punct', text: char, offset: index });
      index += 1;
      continue;
    }

    issues.push(at(source, index, `Achar cannot read \`${char}\` here`));
    index += 1;
  }

  tokens.push({ kind: 'end', text: '', offset: source.length });
  return { tokens, issues };
}

/** Where in the source an offset is, as a line and a column somebody can see. */
function at(source: string, offset: number, message: string): TsIssue {
  const before = source.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column, message };
}

/** A field name has to be a key the studio can address: `attribute_not_exists(#k)`, `a.b`. */
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

// ─────────────────────────────────────────────────────────────────────────────
// The parse
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A type as it was written, before it becomes a field.
 *
 * `unknown` is an answer rather than an exception: it is what the parser says
 * about an expression it cannot map, and the caller decides whether that is an
 * issue to show or a field to leave out.
 */
/**
 * A type expression, and whether it said `null` anywhere at its own level.
 *
 * The second half is not part of the shape because Achar has no "nullable" — a
 * field is either required or not — so `Image | null` and `cover?: Image` are the
 * same field written two ways, and both have to arrive as one.
 */
interface Typed {
  shape: Shape;
  nullable: boolean;
}

function typed(shape: Shape): Typed {
  return { shape, nullable: false };
}

/** Whether a branch was an absence rather than a type: `null`, `undefined`, `void`. */
function absent(shape: Shape): boolean {
  return shape.kind === 'unknown' && ['null', 'undefined', 'void'].includes(shape.because);
}

type Shape =
  | { kind: 'scalar'; type: SchemaFieldType }
  | { kind: 'reference'; to: string[] }
  | { kind: 'object'; fields: SchemaField[] }
  | { kind: 'array'; of: SchemaField[] }
  | { kind: 'options'; options: { title: string; value: string }[] }
  | { kind: 'unknown'; because: string };

/** A comment read as words: the first line is a title, the rest is prose. */
interface Doc {
  title: string;
  description: string;
}

const NO_DOC: Doc = { title: '', description: '' };

class Parser {
  private index = 0;

  constructor(
    private readonly source: string,
    private readonly tokens: Token[],
    private readonly issues: TsIssue[],
  ) {}

  run(): ParsedDeclaration {
    const declarationDoc = this.takeDoc();
    const keyword = this.peek();

    if (keyword.kind !== 'name' || (keyword.text !== 'type' && keyword.text !== 'interface')) {
      this.issues.push(
        at(
          this.source,
          keyword.offset,
          'A content type is written as `type Name = { … }` or `interface Name { … }`',
        ),
      );
      return this.empty(declarationDoc);
    }

    this.next();
    const nameToken = this.peek();
    if (nameToken.kind !== 'name') {
      this.issues.push(at(this.source, nameToken.offset, 'This declaration has no name'));
      return this.empty(declarationDoc);
    }
    this.next();

    // `interface X extends Y` is refused rather than half-read: the fields it
    // would inherit live in another type, and a copy of them here would be a copy
    // that stops matching the moment Y changes.
    if (this.peek().kind === 'name' && this.peek().text === 'extends') {
      this.issues.push(
        at(this.source, this.peek().offset, 'Achar reads a type on its own: write the fields out'),
      );
      while (this.peek().kind !== 'end' && this.peek().text !== '{') this.next();
    }

    if (this.peek().text === '=') this.next();

    if (this.peek().text !== '{') {
      this.issues.push(
        at(this.source, this.peek().offset, 'Achar reads one object type: the fields go in `{ … }`'),
      );
      return this.empty(declarationDoc, nameToken.text);
    }

    const fields = this.objectBody();

    return {
      name: acharName(nameToken.text),
      title: declarationDoc.title || humanise(nameToken.text),
      description: declarationDoc.description,
      fields,
      issues: this.issues,
    };
  }

  /** `{ … }` at the current token, read as a list of fields. */
  private objectBody(): SchemaField[] {
    this.expect('{');
    const fields: SchemaField[] = [];

    while (this.peek().kind !== 'end' && this.peek().text !== '}') {
      const doc = this.takeDoc();
      const member = this.peek();

      if (member.text === '[') {
        // An index signature — `[key: string]: string` — is a map, and a map is
        // not a form: there is no control that edits "any number of keys".
        this.issues.push(
          at(this.source, member.offset, 'Achar cannot read an index signature as a field'),
        );
        this.skipMember();
        continue;
      }

      if (member.kind !== 'name' && member.kind !== 'string') {
        this.issues.push(at(this.source, member.offset, 'Achar expected a field name here'));
        this.skipMember();
        continue;
      }

      this.next();
      const optional = this.peek().text === '?';
      if (optional) this.next();

      if (this.peek().text !== ':') {
        // A method or a call signature: neither is a value a document holds.
        this.issues.push(
          at(this.source, this.peek().offset, `Achar cannot read \`${member.text}\` as a field`),
        );
        this.skipMember();
        continue;
      }
      this.next();

      if (member.kind === 'string' || !FIELD_NAME.test(member.text)) {
        // A quoted member name is legal TypeScript and unaddressable here: the
        // studio's update paths split on dots and refuse a dash, so a field that
        // arrived under a name nobody can address is a field nobody can edit.
        this.issues.push(
          at(
            this.source,
            member.offset,
            `\`${member.text}\` is not a name a document field can have — use letters, digits and _`,
          ),
        );
        this.skipMember();
        continue;
      }

      const offset = member.offset;
      const declared = this.typeExpression();
      const field = this.toField(member.text, declared.shape, doc, optional || declared.nullable, offset);
      if (field) fields.push(field);

      this.skipToMemberEnd();
    }

    this.expect('}');
    return fields;
  }

  /**
   * One type expression: a union of everything Achar understands.
   *
   * `|` is read here rather than at the member, because a union means two
   * different things depending on what is in it — `'a' | 'b'` is a picker, and
   * `Image | null` is an optional image.
   */
  private typeExpression(): Typed {
    const branches: Shape[] = [];
    let nullable = false;

    for (;;) {
      const branch = this.primary();
      if (branch.nullable) nullable = true;
      if (!absent(branch.shape)) branches.push(branch.shape);
      if (this.peek().text !== '|') break;
      this.next();
    }

    if (this.peek().text === '&') {
      // An intersection reads as "both of these at once", which for a document
      // field is two controls fighting over one key. Refused by name rather than
      // read as its first half, which is what a half-reading parser does — and the
      // rest of the member is eaten, so the debris does not become a field.
      this.issues.push(
        at(this.source, this.peek().offset, 'Achar cannot read an intersection as a field'),
      );
      this.skipMember();
      return { shape: { kind: 'unknown', because: 'an intersection' }, nullable };
    }

    return { shape: this.merge(branches), nullable };
  }

  private primary(): Typed {
    return this.suffix(this.bare());
  }

  /**
   * `[]` after anything, which is how a list is written.
   *
   * Read here rather than inside one branch, because a list of *objects* —
   * `{ a: string }[]` — is as ordinary as a list of strings, and a parser that
   * only looked for `[]` after a name reads that as an object followed by
   * something it cannot explain. Applied after the whole primary, so `A | B[]` is
   * A or a list of B, which is what TypeScript means by it too.
   */
  private suffix(typed: Typed): Typed {
    let current = typed;
    while (this.peek().text === '[' && this.peekAhead().text === ']') {
      this.next();
      this.next();
      // `(Image | null)[]` is a list whose items may be empty, which is the item
      // field not being required. The list itself is always there.
      current = {
        shape: { kind: 'array', of: [this.fieldFromShape('item', current.shape, NO_DOC, current.nullable)] },
        nullable: false,
      };
    }
    return current;
  }

  private bare(): Typed {
    const token = this.peek();

    if (token.text === '{') {
      return typed({ kind: 'object', fields: this.objectBody() });
    }

    if (token.text === '[') {
      // A tuple is a fixed list of different things; Achar's `array` is one item
      // shape repeated, so a tuple is a list it cannot draw.
      this.issues.push(at(this.source, token.offset, 'Achar cannot read a tuple as a field'));
      this.skipBalanced('[', ']');
      return typed({ kind: 'unknown', because: 'a tuple' });
    }

    if (token.kind === 'string') {
      this.next();
      return typed({ kind: 'options', options: [{ title: humanise(token.text), value: token.text }] });
    }

    if (token.text === '(') {
      this.next();
      const inner = this.typeExpression();
      this.expect(')');
      return inner;
    }

    if (token.kind !== 'name') {
      this.issues.push(at(this.source, token.offset, 'Achar expected a type here'));
      this.next();
      return typed({ kind: 'unknown', because: 'nothing' });
    }

    this.next();
    const written = token.text;

    // `null` on its own is an absent branch: the union above is what decides
    // whether that made the field optional or made it a mistake.
    if (written === 'null' || written === 'undefined' || written === 'void') {
      return { shape: { kind: 'unknown', because: written }, nullable: true };
    }

    if (written === 'Array' || written === 'ReadonlyArray') {
      const args = this.typeArguments();
      const item = args[0] ?? typed({ kind: 'unknown', because: 'nothing' });
      return typed({
        kind: 'array',
        of: [this.fieldFromShape('item', item.shape, NO_DOC, item.nullable)],
      });
    }

    if (this.peek().text === '<') {
      this.typeArguments();
      this.issues.push(at(this.source, token.offset, `Achar cannot read \`${written}<…>\` as a field`));
      return typed({ kind: 'unknown', because: `\`${written}<…>\`` });
    }

    return typed(this.identShape(written));
  }

  private identShape(written: string): Shape {
    const byCase = BY_CASE[written];
    if (byCase) return { kind: 'scalar', type: byCase };

    const scalar = SCALARS[written.toLowerCase()];
    if (scalar) return { kind: 'scalar', type: scalar };

    return { kind: 'reference', to: [acharName(written)] };
  }

  /** The `<…>` after a generic name, as types — read and discarded by the callers. */
  private typeArguments(): Typed[] {
    const args: Typed[] = [];
    if (this.peek().text !== '<') return args;
    this.next();

    let depth = 1;
    while (this.peek().kind !== 'end' && depth > 0) {
      if (this.peek().text === '<') depth += 1;
      if (this.peek().text === '>') {
        depth -= 1;
        if (depth === 0) break;
      }
      args.push(this.typeExpression());
      if (this.peek().text === ',') this.next();
    }

    this.expect('>');
    return args;
  }

  /**
   * The branches of a union, as one shape.
   *
   * `null` and `undefined` beside something make that something optional; several
   * string literals are a closed set, which is a picker; one branch on its own is
   * itself. Anything else is a union Achar would have to invent a control for, and
   * it says so instead.
   */
  private merge(branches: Shape[]): Shape {
    const present = branches.filter((branch) => !absent(branch));
    if (present.length === 0) return { kind: 'unknown', because: 'nothing' };
    if (present.length === 1) return present[0]!;

    if (present.every((branch) => branch.kind === 'options')) {
      return {
        kind: 'options',
        options: present.flatMap((branch) => (branch.kind === 'options' ? branch.options : [])),
      };
    }

    // `Author | Person` is one reference that may point at either, which is what
    // Achar's `to` list is — and what a document type that grew a second kind of
    // author actually means.
    if (present.every((branch) => branch.kind === 'reference')) {
      return {
        kind: 'reference',
        to: present.flatMap((branch) => (branch.kind === 'reference' ? branch.to : [])),
      };
    }

    if (present.every((branch) => branch.kind === 'scalar')) {
      const types = new Set(present.map((branch) => (branch.kind === 'scalar' ? branch.type : '')));
      if (types.size === 1) return present[0]!;
    }

    return { kind: 'unknown', because: 'a union Achar cannot draw a control for' };
  }

  private toField(
    written: string,
    shape: Shape,
    doc: Doc,
    optional: boolean,
    offset: number,
  ): SchemaField | null {
    if (shape.kind === 'unknown') {
      const reason =
        shape.because === 'nothing' || shape.because === 'null'
          ? 'has no type Achar can put a control behind'
          : `is ${shape.because}`;
      this.issues.push(at(this.source, offset, `\`${written}\` ${reason}`));
      return null;
    }

    return this.fieldFromShape(written, shape, doc, optional);
  }

  private fieldFromShape(
    written: string,
    shape: Shape,
    doc: Doc = NO_DOC,
    optional = false,
  ): SchemaField {
    const base = {
      name: written,
      title: doc.title || humanise(written),
      required: !optional,
      ...(doc.description ? { description: doc.description } : {}),
    };

    switch (shape.kind) {
      case 'scalar':
        return defineField({ ...base, type: shape.type });
      case 'reference':
        return defineField({ ...base, type: 'reference', to: shape.to });
      case 'object':
        return defineField({ ...base, type: 'object', fields: shape.fields });
      case 'array':
        return defineField({ ...base, type: 'array', of: shape.of });
      case 'options':
        return defineField({ ...base, type: 'string', options: shape.options });
      case 'unknown':
        // Only reached for an array item that could not be read; the field that
        // held it is already an issue and this keeps the list non-empty.
        return defineField({ ...base, type: 'string' });
    }
  }

  // ── Token handling ────────────────────────────────────────────────────────

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: 'end', text: '', offset: this.source.length };
  }

  private peekAhead(): Token {
    return this.tokens[this.index + 1] ?? { kind: 'end', text: '', offset: this.source.length };
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'end') this.index += 1;
    return token;
  }

  /** The comments before the current token, as a field's or a type's own words. */
  private takeDoc(): Doc {
    const lines: string[] = [];
    while (this.peek().kind === 'doc') lines.push(this.next().text);

    const text = lines.join('\n').trim();
    if (!text) return NO_DOC;

    const [first, ...rest] = text.split('\n');
    return { title: (first ?? '').trim(), description: rest.join(' ').trim() };
  }

  private expect(text: string): void {
    if (this.peek().text === text) {
      this.next();
      return;
    }
    this.issues.push(at(this.source, this.peek().offset, `Achar expected \`${text}\` here`));
  }

  private skipBalanced(open: string, close: string): void {
    if (this.peek().text !== open) return;
    this.next();
    let depth = 1;
    while (this.peek().kind !== 'end' && depth > 0) {
      if (this.peek().text === open) depth += 1;
      if (this.peek().text === close) depth -= 1;
      this.next();
    }
  }

  /** Past whatever is left of the member that could not be read. */
  private skipMember(): void {
    while (this.peek().kind !== 'end' && ![';', ',', '}'].includes(this.peek().text)) this.next();
    this.skipToMemberEnd();
  }

  private skipToMemberEnd(): void {
    if (this.peek().text === ';' || this.peek().text === ',') this.next();
  }

  private empty(doc: Doc, written?: string): ParsedDeclaration {
    return {
      name: written ? acharName(written) : '',
      title: doc.title || (written ? humanise(written) : ''),
      description: doc.description,
      fields: [],
      issues: this.issues,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

/** A declaration, read into the fields Achar stores. */
export function parseTypeDeclaration(source: string): ParsedDeclaration {
  const { tokens, issues } = tokenize(source);

  if (tokens.every((token) => token.kind === 'end')) {
    return {
      name: '',
      title: '',
      description: '',
      fields: [],
      issues: [...issues, { line: 1, column: 1, message: 'There is nothing here yet' }],
    };
  }

  return new Parser(source, tokens, issues).run();
}

/**
 * `PricingPlan` → `pricingPlan`.
 *
 * Only the first letter moves. A name is data — it is in every document and every
 * query — so this does as little to it as it can and still turn a PascalCase
 * declaration into the name Achar files documents under.
 */
export function acharName(written: string): string {
  const trimmed = written.trim();
  if (!trimmed) return '';
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
}

/** `pricingPlan` → `Pricing plan`. What something is called when nobody said. */
export function humanise(written: string): string {
  const spaced = written
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
