/**
 * GROQ — the subset that matters, and exactly what it is.
 *
 * ```
 *   *                        the documents the query runs over
 *   *[filter]                a filter over them
 *   &&   ||   !              boolean operators
 *   ==   !=   <   >   <=  >= comparison
 *   in                       membership of a list, or a substring of a string
 *   match                    the glob `*` (any run) and `?` (one character)
 *   defined(expr)            true when a value is neither absent nor null
 *   count(expr)              the length of a list — `count(*[_type == "post"])`
 *   order(expr asc|desc, …)  after a pipe: `* | order(_updatedAt desc)`
 *   [n...m]  [n...]  [n]     a slice, an open slice, or one item; `n` may be negative
 *   { field, "alias": expr, nested { } }   a projection, nested as deep as you like
 *   ->                       dereference: `author->name`
 *   ^                        the enclosing scope, from inside a nested projection
 *   $name                    a parameter, supplied in `params`
 *   |                        apply a function, a projection or a slice
 * ```
 *
 * Two things are here that a strict reading of the list above would not allow,
 * and both are deliberate. **List literals** — `["post", "page"]` — because `in`
 * without them can only be used against a parameter, which makes the one
 * operator that most wants a literal the one that cannot have one. And an
 * **open slice** `[0...]`, the same production as `[n...m]` with the end left
 * off, which is what "the next twenty" is written as.
 *
 * Everything else is a `HttpError(400)` naming the character position — never an
 * empty result. `...` (a spread projection), array projections (`*[].items[]{ }`),
 * subqueries, joins (`*[]{ … }`), `references()`, `select()`, `score()`,
 * `boost()`, `path()`, arithmetic and string functions are all outside this
 * subset, and each of them says so rather than returning nothing, because a
 * query that silently matches no documents is indistinguishable from a dataset
 * with no content in it.
 *
 * Which documents a query runs over is the caller's business: the route fetches
 * candidates from an index and hands them in, so nothing here can become a scan.
 */

import { evaluate, type EvalContext, type Scope } from './evaluate';
import { parse, parseProjectionText, type Expr } from './parser';

export type { Expr, Ordering, ProjectionField } from './parser';
export { parse, parseProjectionText } from './parser';
export { evaluate } from './evaluate';
export type { EvalContext, Scope } from './evaluate';

export interface RunQueryOptions {
  /** `$name` values. A query that names one this does not carry is a 400. */
  params?: Record<string, unknown>;
  /** What `*` means. */
  documents?: unknown[];
  /** Resolves a `_ref` the fetched set does not hold. */
  lookup?: (id: string) => Promise<unknown> | unknown;
  /** The value an expression with no `*` in it starts from — a webhook's document. */
  scope?: unknown;
}

/** Parses and evaluates one query string. */
export async function runQuery(query: string, options: RunQueryOptions = {}): Promise<unknown> {
  const expr = parse(query);
  const ctx: EvalContext = {
    params: options.params ?? {},
    documents: options.documents ?? [],
    ...(options.lookup ? { lookup: options.lookup } : {}),
  };
  return evaluate(expr, ctx, { this: options.scope ?? null });
}

/**
 * The `_type` a filter pins, when it pins one.
 *
 * This is what lets the query route use `TypeIndex` instead of `UpdatedIndex`.
 * Only an equality against a string counts: `_type in ["post"]` is a fine filter
 * and a useless hint, and guessing a type out of a filter that does not
 * determine one would read the wrong partition and answer with fewer documents
 * than the dataset holds.
 */
export function typeHintOf(query: string | Expr): string | undefined {
  const expr = typeof query === 'string' ? parse(query) : query;
  return findTypeHint(expr);
}

function findTypeHint(expr: Expr): string | undefined {
  if (
    expr.kind === 'binary' &&
    expr.op === '==' &&
    expr.left.kind === 'field' &&
    expr.left.source.kind === 'this' &&
    expr.left.name === '_type' &&
    expr.right.kind === 'literal' &&
    typeof expr.right.value === 'string'
  ) {
    return expr.right.value;
  }

  for (const child of childrenOf(expr)) {
    const hint = findTypeHint(child);
    if (hint) return hint;
  }
  return undefined;
}

function childrenOf(expr: Expr): Expr[] {
  switch (expr.kind) {
    case 'array':
      return expr.items;
    case 'field':
    case 'index':
    case 'slice':
    case 'order':
    case 'deref':
    case 'projection':
    case 'parent':
    case 'this':
    case 'star':
    case 'literal':
    case 'param':
      return 'source' in expr ? [expr.source] : [];
    case 'filter':
      return [expr.source, expr.filter];
    case 'call':
      return expr.args;
    case 'unary':
      return [expr.operand];
    case 'binary':
      return [expr.left, expr.right];
  }
}

/**
 * Whether a webhook's filter admits a document.
 *
 * A filter is an expression rather than a whole query — `_type == "post"` — so
 * it is evaluated with the document in scope and nothing else. That is exactly
 * how the field is documented, and it is what makes a webhook's filter the same
 * text a query's filter is.
 */
export async function matchesFilter(
  filter: string | null | undefined,
  document: unknown,
  options: RunQueryOptions = {},
): Promise<boolean> {
  if (!filter || !filter.trim()) return true;
  const result = await runQuery(filter, { ...options, scope: document });
  return result === true;
}

/** A webhook's projection, applied to the document it is being told about. */
export async function applyProjection(
  projection: string | null | undefined,
  document: unknown,
  options: RunQueryOptions = {},
): Promise<unknown> {
  if (!projection || !projection.trim()) return document;

  const fields = parseProjectionText(projection);
  const ctx: EvalContext = {
    params: options.params ?? {},
    documents: options.documents ?? [],
    ...(options.lookup ? { lookup: options.lookup } : {}),
  };
  const scope: Scope = { this: document };
  return evaluate({ kind: 'projection', source: { kind: 'this' }, fields }, ctx, scope);
}
