/**
 * GROQ's grammar, as a recursive-descent parser.
 *
 * Everything a query can be is one expression: `*[_type == "post"]{title}` is a
 * projection over a filter over the document set, `count(*[...])` is a call on
 * one, and `* | order(_updatedAt desc)[0...8]` is a slice over an ordering — so
 * there is one `parse`, one tree, and no separate notion of a "pipeline" that
 * would have to agree with the expression syntax about precedence.
 *
 * The parser is where "anything outside the grammar is a 400 naming the
 * position" is enforced. Every branch that cannot continue throws with the
 * offset of the token that stopped it, and the message says what was expected
 * rather than what was found, because the expected thing is what the author has
 * to add.
 */

import type { Token, TokenType } from './lexer';
import { syntax, tokenize } from './lexer';

export type BinaryOp = '&&' | '||' | '==' | '!=' | '<' | '>' | '<=' | '>=' | 'in' | 'match';

export interface Ordering {
  expr: Expr;
  direction: 'asc' | 'desc';
}

export interface ProjectionField {
  /** The name this field has in the output, which is the alias when one was written. */
  alias: string;
  value: Expr;
}

export type Expr =
  /** `*` — the documents the query runs over. */
  | { kind: 'star' }
  /** The value in scope: a document in a filter, an item in a projection. */
  | { kind: 'this' }
  /** `^` — the scope one level out, which is what a nested projection reaches for. */
  | { kind: 'parent' }
  | { kind: 'literal'; value: unknown }
  | { kind: 'param'; name: string; position: number }
  | { kind: 'array'; items: Expr[] }
  | { kind: 'field'; source: Expr; name: string }
  | { kind: 'index'; source: Expr; index: number }
  | { kind: 'slice'; source: Expr; start: number | null; end: number | null }
  | { kind: 'filter'; source: Expr; filter: Expr }
  | { kind: 'order'; source: Expr; orderings: Ordering[] }
  | { kind: 'deref'; source: Expr }
  | { kind: 'projection'; source: Expr; fields: ProjectionField[] }
  | { kind: 'call'; name: string; args: Expr[]; position: number }
  | { kind: 'unary'; op: '!' | '-'; operand: Expr; position: number }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr; position: number };

const COMPARISONS: Record<string, BinaryOp> = {
  eq: '==',
  neq: '!=',
  lt: '<',
  gt: '>',
  lte: '<=',
  gte: '>=',
};

/** The functions this subset implements. Anything else is a 400, never a `null`. */
export const FUNCTIONS = new Set(['defined', 'count']);

export function parse(input: string): Expr {
  return new Parser(tokenize(input), input).parseQuery();
}

/**
 * A projection from the text a webhook stores.
 *
 * Braces are optional here and nowhere else: `sanity`-shaped configuration
 * writes a projection as `{ title, slug }`, and a field asking for one is a
 * field people paste a body into.
 */
export function parseProjectionText(input: string): ProjectionField[] {
  const trimmed = input.trim();
  const expr = parse(trimmed.startsWith('{') ? trimmed : `{ ${trimmed} }`);
  if (expr.kind !== 'projection') {
    throw syntax('Expected a projection', 0, input);
  }
  return expr.fields;
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly query: string,
  ) {}

  parseQuery(): Expr {
    const expr = this.parseOr();
    if (this.peek().type !== 'eof') {
      throw syntax(
        `Unexpected ${describe(this.peek())} — expected the end of the query`,
        this.peek().start,
        this.query,
      );
    }
    return expr;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (token.type !== 'eof') this.pos += 1;
    return token;
  }

  private at(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private accept(type: TokenType): boolean {
    if (!this.at(type)) return false;
    this.next();
    return true;
  }

  private expect(type: TokenType, expected: string): Token {
    if (!this.at(type)) {
      throw syntax(`Expected ${expected}, found ${describe(this.peek())}`, this.peek().start, this.query);
    }
    return this.next();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.at('or')) {
      const token = this.next();
      left = { kind: 'binary', op: '||', left, right: this.parseAnd(), position: token.start };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseComparison();
    while (this.at('and')) {
      const token = this.next();
      left = { kind: 'binary', op: '&&', left, right: this.parseComparison(), position: token.start };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseUnary();

    for (;;) {
      const token = this.peek();
      const comparison = COMPARISONS[token.type];
      if (comparison) {
        this.next();
        left = { kind: 'binary', op: comparison, left, right: this.parseUnary(), position: token.start };
        continue;
      }
      if (token.type === 'ident' && (token.value === 'in' || token.value === 'match')) {
        this.next();
        left = {
          kind: 'binary',
          op: token.value === 'in' ? 'in' : 'match',
          left,
          right: this.parseUnary(),
          position: token.start,
        };
        continue;
      }
      return left;
    }
  }

  private parseUnary(): Expr {
    if (this.at('not')) {
      const token = this.next();
      return { kind: 'unary', op: '!', operand: this.parseUnary(), position: token.start };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();

    for (;;) {
      const token = this.peek();

      if (token.type === 'dot') {
        this.next();
        const name = this.expect('ident', 'a field name after `.`');
        expr = { kind: 'field', source: expr, name: name.value };
        continue;
      }

      if (token.type === 'arrow') {
        this.next();
        expr = { kind: 'deref', source: expr };
        continue;
      }

      if (token.type === 'lbracket') {
        expr = this.parseBracket(expr);
        continue;
      }

      if (token.type === 'lbrace') {
        expr = this.parseProjection(expr);
        continue;
      }

      if (token.type === 'pipe') {
        expr = this.parsePipe(expr);
        continue;
      }

      return expr;
    }
  }

  /**
   * `[...]`, which is a filter, a slice or an index.
   *
   * Tried as a slice first because the two are told apart by their contents and
   * not by their position: `[0]` is an index and `[_type == "post"]` is a filter,
   * and a query `*[0]` that silently filtered on the number zero would be a
   * wrong answer rather than a syntax error.
   */
  private parseBracket(source: Expr): Expr {
    const opening = this.next();
    const save = this.pos;

    const start = this.at('number') ? Number(this.next().value) : null;

    if (this.at('ellipsis')) {
      this.next();
      const end = this.at('number') ? Number(this.next().value) : null;
      if (this.at('rbracket')) {
        this.next();
        return { kind: 'slice', source, start, end };
      }
    } else if (start !== null && this.at('rbracket')) {
      this.next();
      return { kind: 'index', source, index: start };
    }

    this.pos = save;
    const filter = this.parseOr();
    this.expect('rbracket', '`]` to close a filter');
    void opening;
    return { kind: 'filter', source, filter };
  }

  private parseProjection(source: Expr): Expr {
    this.expect('lbrace', '`{`');
    const fields: ProjectionField[] = [];

    while (!this.at('rbrace')) {
      const token = this.peek();

      if (token.type === 'ellipsis') {
        throw syntax(
          'A spread projection (`...`) is not part of the supported grammar',
          token.start,
          this.query,
        );
      }

      if (token.type === 'string') {
        this.next();
        this.expect('colon', '`:` after an aliased projection field');
        fields.push({ alias: token.value, value: this.parseOr() });
      } else if (token.type === 'ident') {
        this.next();
        if (this.accept('colon')) {
          fields.push({ alias: token.value, value: this.parseOr() });
        } else if (this.at('lbrace')) {
          const inner = this.parseProjection({ kind: 'field', source: { kind: 'this' }, name: token.value });
          fields.push({ alias: token.value, value: inner });
        } else {
          fields.push({
            alias: token.value,
            value: { kind: 'field', source: { kind: 'this' }, name: token.value },
          });
        }
      } else {
        throw syntax(
          `Expected a field name or an alias in a projection, found ${describe(token)}`,
          token.start,
          this.query,
        );
      }

      if (!this.accept('comma')) break;
    }

    this.expect('rbrace', '`}` to close a projection');
    return { kind: 'projection', source, fields };
  }

  private parsePipe(source: Expr): Expr {
    this.next();

    if (this.at('lbrace')) return this.parseProjection(source);
    if (this.at('lbracket')) return this.parseBracket(source);

    if (this.at('ident')) {
      const name = this.next();
      this.expect('lparen', '`(` after a function name');

      if (name.value === 'order') {
        const orderings: Ordering[] = [];
        do {
          const expr = this.parseOr();
          let direction: 'asc' | 'desc' = 'asc';
          const token = this.peek();
          if (token.type === 'ident' && (token.value === 'asc' || token.value === 'desc')) {
            this.next();
            direction = token.value;
          }
          orderings.push({ expr, direction });
        } while (this.accept('comma'));
        this.expect('rparen', '`)` to close `order(`');
        return { kind: 'order', source, orderings };
      }

      throw syntax(
        `\`${name.value}\` cannot follow a pipe — only \`order(...)\`, a projection and a slice can`,
        name.start,
        this.query,
      );
    }

    throw syntax(
      'Expected a function call, a projection or a slice after `|`',
      this.peek().start,
      this.query,
    );
  }

  private parsePrimary(): Expr {
    const token = this.peek();

    switch (token.type) {
      case 'star':
        this.next();
        return { kind: 'star' };

      case 'parent':
        this.next();
        return { kind: 'parent' };

      case 'string':
        this.next();
        return { kind: 'literal', value: token.value };

      case 'number':
        this.next();
        return { kind: 'literal', value: Number(token.value) };

      case 'param':
        this.next();
        return { kind: 'param', name: token.value, position: token.start };

      case 'lparen': {
        this.next();
        const inner = this.parseOr();
        this.expect('rparen', '`)`');
        return inner;
      }

      case 'lbrace':
        return this.parseProjection({ kind: 'this' });

      case 'lbracket': {
        this.next();
        const items: Expr[] = [];
        if (!this.at('rbracket')) {
          do {
            items.push(this.parseOr());
          } while (this.accept('comma'));
        }
        this.expect('rbracket', '`]` to close a list');
        return { kind: 'array', items };
      }

      case 'ident': {
        this.next();
        if (token.value === 'true') return { kind: 'literal', value: true };
        if (token.value === 'false') return { kind: 'literal', value: false };
        if (token.value === 'null') return { kind: 'literal', value: null };

        if (this.at('lparen')) {
          if (!FUNCTIONS.has(token.value)) {
            throw syntax(
              `\`${token.value}()\` is not a function this query language has`,
              token.start,
              this.query,
            );
          }
          this.next();
          const args: Expr[] = [];
          if (!this.at('rparen')) {
            do {
              args.push(this.parseOr());
            } while (this.accept('comma'));
          }
          this.expect('rparen', '`)` to close a function call');
          return { kind: 'call', name: token.value, args, position: token.start };
        }

        return { kind: 'field', source: { kind: 'this' }, name: token.value };
      }

      default:
        throw syntax(`Unexpected ${describe(token)} in an expression`, token.start, this.query);
    }
  }
}

function describe(token: Token): string {
  if (token.type === 'eof') return 'the end of the query';
  if (token.type === 'string') return `the string ${JSON.stringify(token.value)}`;
  if (token.type === 'ident') return `\`${token.value}\``;
  return `\`${token.value}\``;
}
