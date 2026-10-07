import type { SchemaField, SchemaFieldType } from '@achar/types';

import { defineField } from '../dsl';
import { humanise } from './parse';

/**
 * Reading a sample of data as a schema.
 *
 * The other way into a content type, and usually the faster one: instead of
 * writing a declaration, paste a document — one object, or a list of them, from a
 * query or an export — and this answers with the fields it can see. `print.ts`
 * turns those into the TypeScript the editor holds, so pasting a sample ends with
 * a declaration somebody can read and correct rather than a black box.
 *
 * Two things it will not guess:
 *
 * - **A reference.** `"author": "maya"` is a string as far as a sample knows; only
 *   the person who wrote the data knows it points at an `author` document. Pointing
 *   at one is a line in the editor, which is why the editor is the other half of
 *   this.
 * - **A required field.** Presence in every record of the sample is the only
 *   evidence available, and one sample is not a corpus. It is the best answer
 *   there is, and it is written down here so that nobody has to wonder where it
 *   came from.
 *
 * Everything it *did* have to decide is returned as a note, in the words of
 * somebody who has to check it: a key that was renamed to be addressable, a scalar
 * that was widened because two records disagreed, a date recognised as one.
 * Inferred fields are a first draft, and a draft nobody is told about is a draft
 * somebody trusts.
 */

export interface Inference {
  /** The fields the sample implies, in the order they first appear. */
  fields: SchemaField[];
  /** A name for the type, when the sample named one — a document's own `_type`. */
  name: string;
  /** What was guessed, renamed or widened. Empty when the sample was unambiguous. */
  notes: string[];
}

export function inferFields(sample: unknown): Inference {
  const notes = new Set<string>();
  const records = recordsOf(sample);

  if (!records) {
    return {
      fields: [],
      name: '',
      notes: ['A sample is an object with fields in it, or a list of such objects.'],
    };
  }

  const name = nameOf(records, notes);
  const fields = fieldsOf(records, notes);

  if (fields.length === 0) {
    notes.add('The sample has no fields Achar can read — a document’s own _id and _type are not content.');
  }

  return { fields, name, notes: [...notes] };
}

/** The objects in a sample: one, or the objects of a list. */
function recordsOf(sample: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(sample)) {
    const objects = sample.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' && entry !== null && !Array.isArray(entry),
    );
    return objects.length > 0 ? objects : null;
  }

  if (typeof sample === 'object' && sample !== null) return [sample as Record<string, unknown>];
  return null;
}

/**
 * The type's name, from the sample's own `_type`.
 *
 * A document that came out of Achar carries the name it was filed under, and
 * asking somebody to retype it would be asking them for something the sample
 * already said.
 */
function nameOf(records: Record<string, unknown>[], notes: Set<string>): string {
  for (const record of records) {
    const type = record._type;
    if (typeof type === 'string' && type.trim()) {
      notes.add(`The type is called after the sample’s own _type, \`${type}\`.`);
      return type.trim();
    }
  }
  return '';
}

/** Every field the records have in common, required where all of them had it. */
function fieldsOf(records: Record<string, unknown>[], notes: Set<string>): SchemaField[] {
  const order: string[] = [];
  const shapes = new Map<string, Inferred[]>();
  const present = new Map<string, number>();

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const name = fieldNameOf(key, notes);
      if (!name) continue;

      if (!shapes.has(name)) {
        order.push(name);
        shapes.set(name, []);
        present.set(name, 0);
      }
      if (value !== null && value !== undefined) present.set(name, (present.get(name) ?? 0) + 1);
      shapes.get(name)!.push(shapeOf(value, notes));
    }
  }

  return order.map((name) => {
    const seen = shapes.get(name) ?? [];
    const shape = mergeShapes(seen, name, notes);
    // Required only when every record carried a value: one null in a sample is
    // one field Achar would refuse a document for.
    const required = (present.get(name) ?? 0) === records.length;
    return fieldOf(name, shape, required, notes);
  });
}

/**
 * A key as a field name, or `''` for one that is not content.
 *
 * `_id`, `_type`, `_rev` and the timestamps are Achar's own — a document is those
 * things whatever the schema says — so they are not fields. A key that cannot be
 * a field name is camel-cased, because the alternative is a schema whose first act
 * is a parser error about a name the sample came with.
 */
function fieldNameOf(key: string, notes: Set<string>): string {
  if (/^_/.test(key)) return '';
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return key;

  const camel = key
    .replace(/[^A-Za-z0-9]+([A-Za-z0-9])/g, (_, next: string) => next.toUpperCase())
    .replace(/^[^A-Za-z_]+/, '')
    .replace(/[^A-Za-z0-9_]/g, '');

  if (!camel) {
    notes.add(`\`${key}\` is not a name a field can have, so it was left out.`);
    return '';
  }

  notes.add(`\`${key}\` became \`${camel}\`, which is a name a document field can have.`);
  return camel;
}

/** What a value looks like, as a field's shape. */
type Inferred =
  | { kind: 'scalar'; type: SchemaFieldType }
  | { kind: 'object'; fields: SchemaField[] }
  | { kind: 'array'; of: SchemaField[] }
  | { kind: 'unknown' };

function shapeOf(value: unknown, notes: Set<string>): Inferred {
  if (value === null || value === undefined) return { kind: 'unknown' };

  if (typeof value === 'string') return { kind: 'scalar', type: stringType(value) };
  if (typeof value === 'number') return { kind: 'scalar', type: 'number' };
  if (typeof value === 'boolean') return { kind: 'scalar', type: 'boolean' };

  if (Array.isArray(value)) {
    const items = value.filter((entry) => entry !== null && entry !== undefined);
    if (items.length === 0) {
      notes.add('A list was empty, so its items are strings until you say otherwise.');
      // Required, because a list's items are not optional: there are simply none
      // of them to look at, which is different from a field that may be absent.
      return {
        kind: 'array',
        of: [defineField({ name: 'item', title: humanise('item'), required: true, type: 'string' })],
      };
    }
    const merged = mergeShapes(
      items.map((entry) => shapeOf(entry, notes)),
      'item',
      notes,
    );
    return { kind: 'array', of: [fieldOf('item', merged, true, notes)] };
  }

  if (typeof value === 'object') {
    return { kind: 'object', fields: fieldsOf([value as Record<string, unknown>], notes) };
  }

  notes.add('A value was neither a string, a number, a boolean, a list nor an object.');
  return { kind: 'unknown' };
}

const DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A string that is a date, as a date.
 *
 * A publish time pasted in as `"2026-03-01T09:00:00.000Z"` is a moment, and a
 * field that draws it as a text box is a field somebody types a typo into. The
 * shapes matched are the ones a JSON export carries and no others: a *day* is a
 * day only when that is the whole of the string, because `2026-03-01` inside a
 * longer sentence is somebody's prose.
 */
function stringType(value: string): SchemaFieldType {
  if (DATE_TIME.test(value)) return 'datetime';
  if (DATE_ONLY.test(value)) return 'date';
  return 'string';
}

/** Several values of one field, as one shape. */
function mergeShapes(shapes: Inferred[], name: string, notes: Set<string>): Inferred {
  const present = shapes.filter((shape) => shape.kind !== 'unknown');
  if (present.length === 0) return { kind: 'unknown' };

  const first = present[0]!;

  if (first.kind === 'scalar') {
    const allScalar = present.every((shape) => shape.kind === 'scalar');
    const types = new Set(present.map((shape) => (shape.kind === 'scalar' ? shape.type : 'string')));
    if (allScalar && types.size === 1) return first;

    // Two records that disagree about a type are a field to widen rather than a
    // field to guess at, and a string holds everything JSON can say.
    notes.add(`\`${name}\` held more than one kind of value, so it is a string.`);
    return { kind: 'scalar', type: 'string' };
  }

  // An object or a list is one shape in Achar — one set of fields, one item shape
  // — so where records disagree the first one seen is the answer, and the note is
  // what stops that from being an invisible choice.
  const sameShape = present.every((shape) => {
    if (shape.kind !== first.kind) return false;
    if (shape.kind !== 'object') return true;
    const names = (shape.kind === 'object' ? shape.fields : []).map((field) => field.name).join(',');
    return names === (first.kind === 'object' ? first.fields : []).map((f) => f.name).join(',');
  });

  if (!sameShape) {
    notes.add(`\`${name}\` is not the same shape in every record; the first was used, so check it.`);
  }

  return first;
}

/** A shape as the field that holds it. */
function fieldOf(
  name: string,
  shape: Inferred,
  required: boolean,
  notes: Set<string>,
): SchemaField {
  const base = { name, title: humanise(name), required };

  switch (shape.kind) {
    case 'scalar':
      return defineField({ ...base, type: shape.type });
    case 'object':
      return defineField({ ...base, type: 'object', fields: shape.fields });
    case 'array':
      return defineField({ ...base, type: 'array', of: shape.of });
    case 'unknown':
      // Nothing was seen of this field but its name — every record had a null.
      notes.add(`\`${name}\` was empty everywhere, so it is a string until you say otherwise.`);
      return untyped(name);
  }
}

function untyped(name: string): SchemaField {
  return defineField({ name, title: humanise(name), required: false, type: 'string' });
}
