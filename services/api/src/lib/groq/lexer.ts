/**
 * GROQ's lexical layer.
 *
 * Every failure here is a 400 that names the character position, because that is
 * the only thing that makes a query written by a person fixable. There is no
 * "skip what I do not understand" path: a lexer that dropped a token would turn
 * `*[_type == "post" && title match "a"]` with a typo into a query that returned
 * every document, which reads as a successful answer.
 */

import { HttpError } from '../http';

export type TokenType =
  | 'star'
  | 'lbracket'
  | 'rbracket'
  | 'lbrace'
  | 'rbrace'
  | 'lparen'
  | 'rparen'
  | 'comma'
  | 'colon'
  | 'dot'
  | 'ellipsis'
  | 'arrow'
  | 'parent'
  | 'pipe'
  | 'and'
  | 'or'
  | 'not'
  | 'eq'
  | 'neq'
  | 'lt'
  | 'gt'
  | 'lte'
  | 'gte'
  | 'ident'
  | 'string'
  | 'number'
  | 'param'
  | 'eof';

export interface Token {
  type: TokenType;
  /** The source text of the token, or its decoded value for a string. */
  value: string;
  start: number;
  end: number;
}

const PUNCTUATION: [string, TokenType][] = [
  ['...', 'ellipsis'],
  ['->', 'arrow'],
  ['||', 'or'],
  ['&&', 'and'],
  ['==', 'eq'],
  ['!=', 'neq'],
  ['<=', 'lte'],
  ['>=', 'gte'],
  ['*', 'star'],
  ['[', 'lbracket'],
  [']', 'rbracket'],
  ['{', 'lbrace'],
  ['}', 'rbrace'],
  ['(', 'lparen'],
  [')', 'rparen'],
  [',', 'comma'],
  [':', 'colon'],
  ['.', 'dot'],
  ['|', 'pipe'],
  ['!', 'not'],
  ['<', 'lt'],
  ['>', 'gt'],
  ['^', 'parent'],
];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }

    // Comments are part of the language people write, even if not of the
    // grammar a machine evaluates: a query stored in a webhook's `filter` is a
    // query somebody will annotate.
    if (char === '/' && input[index + 1] === '/') {
      while (index < input.length && input[index] !== '\n') index += 1;
      continue;
    }

    const punctuation = PUNCTUATION.find(([text]) => input.startsWith(text, index));
    if (punctuation) {
      tokens.push({
        type: punctuation[1],
        value: punctuation[0],
        start: index,
        end: index + punctuation[0].length,
      });
      index += punctuation[0].length;
      continue;
    }

    if (char === '"' || char === "'") {
      const string = readString(input, index);
      tokens.push({ type: 'string', value: string.value, start: index, end: string.end });
      index = string.end;
      continue;
    }

    if (isDigit(char) || (char === '-' && isDigit(input[index + 1]))) {
      const number = readNumber(input, index);
      tokens.push({ type: 'number', value: number.value, start: index, end: number.end });
      index = number.end;
      continue;
    }

    if (char === '$') {
      const name = readIdentifier(input, index + 1);
      if (!name.value) {
        throw syntax('A parameter name must follow `$`', index, input);
      }
      tokens.push({ type: 'param', value: name.value, start: index, end: name.end });
      index = name.end;
      continue;
    }

    if (isIdentifierStart(char)) {
      const identifier = readIdentifier(input, index);
      tokens.push({ type: 'ident', value: identifier.value, start: index, end: identifier.end });
      index = identifier.end;
      continue;
    }

    throw syntax(`Unexpected character ${JSON.stringify(char)}`, index, input);
  }

  tokens.push({ type: 'eof', value: '', start: input.length, end: input.length });
  return tokens;
}

export function syntax(message: string, position: number, query: string): HttpError {
  return new HttpError(
    400,
    'QUERY_SYNTAX',
    `${message} at position ${position + 1} — near ${JSON.stringify(query.slice(Math.max(0, position - 12), position + 12))}`,
    { position: position + 1, query },
  );
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9';
}

function isIdentifierStart(char: string): boolean {
  return /[A-Za-z_]/.test(char);
}

function readIdentifier(input: string, start: number): { value: string; end: number } {
  let end = start;
  while (end < input.length && /[A-Za-z0-9_]/.test(input[end])) end += 1;
  return { value: input.slice(start, end), end };
}

function readNumber(input: string, start: number): { value: string; end: number } {
  let end = start;
  if (input[end] === '-') end += 1;
  while (isDigit(input[end])) end += 1;
  if (input[end] === '.' && isDigit(input[end + 1])) {
    end += 1;
    while (isDigit(input[end])) end += 1;
  }
  return { value: input.slice(start, end), end };
}

/**
 * A quoted string, with the escapes GROQ allows and no others.
 *
 * An unrecognised escape is an error rather than a literal backslash: a query
 * carrying `title == "\d+"` means a regular expression to whoever wrote it and
 * something else entirely to a reader, and saying so is kinder than matching
 * nothing.
 */
function readString(input: string, start: number): { value: string; end: number } {
  const quote = input[start];
  let value = '';
  let index = start + 1;

  while (index < input.length) {
    const char = input[index];
    if (char === '\\') {
      const next = input[index + 1];
      if (next === quote || next === '\\' || next === '/') {
        value += next;
        index += 2;
        continue;
      }
      if (next === 'n') {
        value += '\n';
        index += 2;
        continue;
      }
      if (next === 't') {
        value += '\t';
        index += 2;
        continue;
      }
      throw syntax(`Unsupported escape \\${next ?? ''} in a string`, index, input);
    }
    if (char === quote) return { value, end: index + 1 };
    value += char;
    index += 1;
  }

  throw syntax('Unterminated string', start, input);
}
