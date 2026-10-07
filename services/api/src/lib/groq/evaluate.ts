/**
 * GROQ's evaluator.
 *
 * It runs over an array of documents the caller has already fetched, and that is
 * the whole design: this module never touches DynamoDB. Which documents a query
 * is allowed to consider is a question about indexes, cost and authorization
 * that belongs to the route, and keeping it out of here is what makes the
 * language testable on a fixture and impossible to turn into a scan by accident.
 *
 * Evaluation is asynchronous because of one operator: `->`. A dereference names
 * a document that may not be in the set the query started from — `author->` on a
 * page of posts names authors that no `_type` filter would have fetched — so the
 * context is allowed to resolve one on demand, and the result is memoized so a
 * list of ten posts by one author costs one lookup rather than ten.
 */

import { HttpError } from '../http';
import type { Expr, Ordering, ProjectionField } from './parser';

export interface Scope {
  this: unknown;
  parent?: Scope;
}

export interface EvalContext {
  params: Record<string, unknown>;
  /** What `*` means: the documents this query runs over. */
  documents: unknown[];
  /** Resolves a `_ref` the fetched set does not contain. Called once per id. */
  lookup?: (id: string) => Promise<unknown> | unknown;
  /** The memo behind `lookup`, created on the first dereference of a query. */
  cache?: Map<string, Promise<unknown>>;
}

export async function evaluate(expr: Expr, ctx: EvalContext, scope: Scope): Promise<unknown> {
  switch (expr.kind) {
    case 'star':
      return ctx.documents;

    case 'this':
      return scope.this;

    case 'parent':
      return scope.parent ? scope.parent.this : null;

    case 'literal':
      return expr.value;

    case 'param': {
      if (!(expr.name in ctx.params)) {
        throw new HttpError(400, 'QUERY_PARAMETER_MISSING', `Parameter $${expr.name} was not supplied`, {
          parameter: expr.name,
          position: expr.position + 1,
        });
      }
      return ctx.params[expr.name];
    }

    case 'array': {
      const items: unknown[] = [];
      for (const item of expr.items) items.push(await evaluate(item, ctx, scope));
      return items;
    }

    case 'field': {
      const source = await evaluate(expr.source, ctx, scope);
      if (typeof source !== 'object' || source === null) return undefined;
      return (source as Record<string, unknown>)[expr.name];
    }

    case 'index': {
      const source = await evaluate(expr.source, ctx, scope);
      if (!Array.isArray(source)) return undefined;
      const index = expr.index < 0 ? source.length + expr.index : expr.index;
      return source[index];
    }

    case 'slice': {
      const source = await evaluate(expr.source, ctx, scope);
      if (!Array.isArray(source)) return [];
      const start = expr.start ?? 0;
      const end = expr.end ?? source.length;
      return source.slice(start < 0 ? Math.max(0, source.length + start) : start, end < 0 ? source.length + end : end);
    }

    case 'filter': {
      const source = await evaluate(expr.source, ctx, scope);
      if (!Array.isArray(source)) return [];
      const kept: unknown[] = [];
      for (const item of source) {
        if (truthy(await evaluate(expr.filter, ctx, { this: item, parent: scope }))) kept.push(item);
      }
      return kept;
    }

    case 'order': {
      const source = await evaluate(expr.source, ctx, scope);
      if (!Array.isArray(source)) return [];
      return await sortBy([...source], expr.orderings, ctx, scope);
    }

    case 'deref': {
      const source = await evaluate(expr.source, ctx, scope);
      const id = referenceId(source);
      if (!id) return null;
      return resolveReference(id, ctx);
    }

    case 'projection': {
      const source = await evaluate(expr.source, ctx, scope);
      if (Array.isArray(source)) {
        const out: unknown[] = [];
        for (const item of source) {
          out.push(await project(expr.fields, ctx, { this: item, parent: scope }));
        }
        return out;
      }
      if (source === null || source === undefined) return null;
      return project(expr.fields, ctx, { this: source, parent: scope });
    }

    case 'call':
      return call(expr.name, expr.args, ctx, scope, expr.position);

    case 'unary': {
      const operand = await evaluate(expr.operand, ctx, scope);
      if (expr.op === '!') return !truthy(operand);
      if (typeof operand === 'number') return -operand;
      throw new HttpError(400, 'QUERY_TYPE', 'A unary `-` needs a number', {
        position: expr.position + 1,
      });
    }

    case 'binary': {
      if (expr.op === '&&') {
        const left = await evaluate(expr.left, ctx, scope);
        return truthy(left) ? truthy(await evaluate(expr.right, ctx, scope)) : false;
      }
      if (expr.op === '||') {
        const left = await evaluate(expr.left, ctx, scope);
        return truthy(left) ? true : truthy(await evaluate(expr.right, ctx, scope));
      }

      const left = await evaluate(expr.left, ctx, scope);
      const right = await evaluate(expr.right, ctx, scope);
      return compare(expr.op, left, right);
    }
  }
}

function truthy(value: unknown): boolean {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  if (typeof value === 'string') return value !== '';
  return true;
}

function normalise(value: unknown): unknown {
  return value === undefined ? null : value;
}

function compare(op: string, left: unknown, right: unknown): boolean {
  switch (op) {
    case '==':
      return deepEqual(normalise(left), normalise(right));
    case '!=':
      return !deepEqual(normalise(left), normalise(right));
    case '<':
    case '>':
    case '<=':
    case '>=':
      return ordered(op, left, right);
    case 'in':
      return contains(right, left);
    case 'match':
      return matches(left, right);
    default:
      return false;
  }
}

function ordered(op: string, left: unknown, right: unknown): boolean {
  const a = normalise(left);
  const b = normalise(right);
  if (a === null || b === null) return false;

  let ordering: number;
  if (typeof a === 'number' && typeof b === 'number') ordering = a - b;
  else if (typeof a === 'string' && typeof b === 'string') ordering = a < b ? -1 : a > b ? 1 : 0;
  else return false;

  if (op === '<') return ordering < 0;
  if (op === '>') return ordering > 0;
  if (op === '<=') return ordering <= 0;
  return ordering >= 0;
}

/** `in`: membership of a list, or a substring of a string. */
function contains(container: unknown, value: unknown): boolean {
  if (Array.isArray(container)) {
    return container.some((entry) => deepEqual(normalise(entry), normalise(value)));
  }
  if (typeof container === 'string' && typeof value === 'string') return container.includes(value);
  return false;
}

/**
 * `match`: the glob GROQ uses, where `*` is any run of characters and `?` is one.
 *
 * Anchored at the front unless the pattern starts with `*`, because that is what
 * makes `title match "Achar*"` mean "starts with" — the only reading of a prefix
 * search anybody writes.
 */
function matches(value: unknown, pattern: unknown): boolean {
  if (typeof value !== 'string' || typeof pattern !== 'string') return false;

  const body = pattern
    .split('')
    .map((char) => {
      if (char === '*') return '.*';
      if (char === '?') return '.';
      return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');

  return new RegExp(`^${body}$`, 's').test(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

async function project(fields: ProjectionField[], ctx: EvalContext, scope: Scope): Promise<unknown> {
  const out: Record<string, unknown> = {};
  for (const field of fields) {
    const value = await evaluate(field.value, ctx, scope);
    // A field the document does not have is written as `null` rather than left
    // out: a projection is a shape a client destructures, and a key that is
    // sometimes there is a `undefined` check on every screen.
    out[field.alias] = value === undefined ? null : value;
  }
  return out;
}

/** The id a `_ref` or a bare id names — the two spellings a document may hold. */
function referenceId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    const ref = (value as { _ref?: unknown })._ref;
    if (typeof ref === 'string') return ref;
  }
  return undefined;
}

async function resolveReference(id: string, ctx: EvalContext): Promise<unknown> {
  const inSet = ctx.documents.find(
    (document) =>
      typeof document === 'object' &&
      document !== null &&
      (document as { _id?: unknown })._id === id,
  );
  if (inSet !== undefined) return inSet;
  if (!ctx.lookup) return null;

  ctx.cache ??= new Map();
  if (!ctx.cache.has(id)) ctx.cache.set(id, Promise.resolve(ctx.lookup(id)));
  return (await ctx.cache.get(id)) ?? null;
}

async function sortBy(
  items: unknown[],
  orderings: Ordering[],
  ctx: EvalContext,
  scope: Scope,
): Promise<unknown[]> {
  // Only the first ordering needs the sort to be stable for the rest to matter,
  // and `Array.prototype.sort` is stable in this runtime — so the orderings are
  // applied in reverse and each one refines the last.
  for (const ordering of [...orderings].reverse()) {
    const keys = new Map<unknown, unknown>();
    for (const item of items) {
      keys.set(item, await evaluate(ordering.expr, ctx, { this: item, parent: scope }));
    }

    items.sort((a, b) => {
      const left = keys.get(a);
      const right = keys.get(b);
      const base = rank(left) - rank(right) || direction(left, right);
      return ordering.direction === 'desc' ? -base : base;
    });
  }
  return items;
}

/** Absent values sort last whichever way the ordering runs, which is what a list wants. */
function rank(value: unknown): number {
  return value === undefined || value === null ? 1 : 0;
}

function direction(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  if (typeof left === 'string' && typeof right === 'string') return left < right ? -1 : left > right ? 1 : 0;
  if (typeof left === 'boolean' && typeof right === 'boolean') return Number(left) - Number(right);
  return 0;
}

async function call(
  name: string,
  args: Expr[],
  ctx: EvalContext,
  scope: Scope,
  position: number,
): Promise<unknown> {
  if (name === 'defined') {
    const [arg] = args;
    if (!arg) throw new HttpError(400, 'QUERY_SYNTAX', '`defined()` needs one expression', { position: position + 1 });
    const value = await evaluate(arg, ctx, scope);
    return value !== undefined && value !== null;
  }

  if (name === 'count') {
    const [arg] = args;
    if (!arg) throw new HttpError(400, 'QUERY_SYNTAX', '`count()` needs one expression', { position: position + 1 });
    const value = await evaluate(arg, ctx, scope);
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') return value.length;
    return value === undefined || value === null ? 0 : 1;
  }

  throw new HttpError(400, 'QUERY_SYNTAX', `\`${name}()\` is not a function this query language has`, {
    position: position + 1,
  });
}
