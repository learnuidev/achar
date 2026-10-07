/**
 * Reading a list out of an API answer.
 *
 * The API pages its lists as `{ items, nextToken }`, and a few of them — the
 * projects a person belongs to, the members of one — are small enough that they
 * arrive whole. Both are lists to every screen that draws them, and a hook that
 * had to know which is which would push that distinction up into the page. So
 * the shape is settled here once, by looking at what actually came back.
 */

import type { ListResponse } from '@achar/types';

export function asList<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
    return (value as { items: T[] }).items;
  }
  return [];
}

export function asPage<T>(value: unknown): ListResponse<T> {
  const items = asList<T>(value);
  const nextToken =
    value && typeof value === 'object' ? ((value as { nextToken?: string | null }).nextToken ?? null) : null;
  return { items, nextToken };
}

/** A count the API may or may not have filled in, drawn as a number either way. */
export function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
