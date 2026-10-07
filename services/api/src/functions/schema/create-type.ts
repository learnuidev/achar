/**
 * `POST /v1/schema/{p}/{d}/types` — write one content type.
 *
 * The route a script bootstraps a dataset with, and the one the studio's type
 * editor has always needed: it carries *one* type rather than the whole schema, so
 * adding a content type is not a read-modify-write that races every other editor.
 * `addDatasetType` does the merge, conditionally on the revision it read, and is
 * where that argument is made.
 *
 * **It answers 201 when it added a type and 200 when it replaced one.** That is the
 * whole of the answer to "had I already done this", and it is what makes a bootstrap
 * script safe to run twice — it sends `replaces` and the second run lands on the
 * type it made rather than stacking a copy beside it, and the status says which
 * happened. The body is the dataset's whole schema either way, because that is what
 * a caller needs to do anything else: the revision it just moved to included.
 *
 * Without `replaces` it will not touch a type that exists: a taken name is a 409.
 * See the two readings of that one field on `TypeWrite`.
 *
 * `replaces` is how a rename is said. The name a type is filed under is its
 * identity — it is what documents store as `_type` and what queries name — so
 * renaming is not an edit to a field: it is this type arriving where that one was.
 * The body can only carry the new name, so the old one is stated rather than
 * guessed.
 *
 * `write` access, which is the same rule `put-schema` answers to, and deliberately
 * so: this route can do strictly less than that one — it writes one type and cannot
 * drop any — and two routes that write the same schema disagreeing about who may
 * was only ever going to be a way to be wrong about it once.
 */

import type { SchemaField, SchemaType } from '@achar/types';
import { humanise } from '@achar/schema';
import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  HttpError,
  created,
  json,
  jsonBody,
  listField,
  pathParam,
  stringField,
  withHandler,
  type ApiEvent,
} from '../../lib/http';
import { addDatasetType } from '../../lib/schemas';

/**
 * The type the body describes.
 *
 * Shallow in the same place and for the same reason `put-schema` is: whether a
 * field is well formed is `assertUsableTypes`'s and the schema package's to say,
 * and a second opinion here would be a second place for the two to disagree about
 * what a schema is. What this keeps out is the shape being wrong at the top — a
 * string where the fields should be, a type with no name to be filed under.
 *
 * `title` and `kind` are the two the body may leave out, and both have an answer
 * that is better than an error: a type is named by the person reading a form, so a
 * title defaults to its name made readable, and the overwhelming majority of types
 * are documents rather than objects nested inside another type.
 */
function typeFromBody(body: Record<string, unknown>): SchemaType {
  const name = stringField(body, 'name');
  if (!name) throw new HttpError(400, 'BAD_REQUEST', 'name is required', { field: 'name' });
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new HttpError(400, 'BAD_REQUEST', 'name must be a TypeScript identifier', {
      field: 'name',
    });
  }

  const fields = listField(body, 'fields');
  if (!fields) throw new HttpError(400, 'BAD_REQUEST', 'fields is required', { field: 'fields' });
  if (!fields.every(isFieldObject)) {
    throw new HttpError(400, 'BAD_REQUEST', 'Every entry of fields must be an object', {
      field: 'fields',
    });
  }

  const kind = stringField(body, 'kind') ?? 'document';
  if (kind !== 'document' && kind !== 'object') {
    throw new HttpError(400, 'BAD_REQUEST', 'kind must be `document` or `object`', {
      field: 'kind',
    });
  }

  const title = stringField(body, 'title');
  const icon = stringField(body, 'icon');
  const description = stringField(body, 'description');

  return {
    name,
    title: title || humanise(name),
    kind,
    fields,
    ...(icon ? { icon } : {}),
    ...(description ? { description } : {}),
  };
}

function isFieldObject(value: unknown): value is SchemaField {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');

  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const replaces = stringField(body, 'replaces');

  const written = await addDatasetType(projectId, dataset, {
    type: typeFromBody(body),
    ...(replaces ? { replaces } : {}),
  });

  return written.created ? created(written.schema) : json(written.schema);
}

export const handler = withHandler(main);
