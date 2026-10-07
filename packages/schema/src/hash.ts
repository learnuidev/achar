/**
 * A revision string for a schema, and the reason it is not just `Date.now()`.
 *
 * A revision is compared, never parsed — a client asks "is this the schema I was
 * drawn against" and nothing else — so it has to change when the types change
 * and stay the same when they have not. A timestamp fails the second half: two
 * deployments of one schema would carry two revisions and every client would
 * think it was stale.
 *
 * The encoding is canonicalised — object keys sorted at every depth — because a
 * schema that has been through `JSON.parse` has whatever key order the writer
 * happened to use, and two editors saving the same types must arrive at one
 * revision rather than two.
 */
export function hashRevision(value: unknown): string {
  const input = canonicalJson(value);
  // Two FNV-1a passes with different offsets: one 32-bit pass is 4 billion
  // possible revisions for a value whose collisions are silent and expensive,
  // and the second pass costs one more walk of a string that is already built.
  return `${fnv1a(input, 0x811c9dc5)}${fnv1a(input, 0x01000193)}`;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
}

function fnv1a(input: string, offset: number): string {
  let hash = offset;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // The FNV prime, by shifts: `hash * 16777619` overflows the 32-bit multiply
    // that keeps this in an integer, and the shifts are the same arithmetic.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
