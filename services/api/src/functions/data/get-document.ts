/**
 * `GET /v1/data/doc/{p}/{d}/{docId}` — one document, at one perspective.
 *
 * `published` is the default, and that is the whole of the authorization story
 * this route needs: a caller who does not say otherwise is asking for what a
 * site would serve. An editor who wants the row the studio edits passes
 * `previewDrafts` by name, and a caller who wants "whatever exists" passes
 * `raw` — which answers a draft-only document where `published` answers nothing.
 *
 * A document that exists only as a draft answers 404 at `published` rather than
 * an empty body, because that is what it is: not published, and not a thing this
 * caller can be told about. See `resolveRows` for the table.
 */

import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import {
  editableFor,
  getDocument,
  readLanguages,
  requirePerspective,
  publishedIdOf,
  shapeForDelivery,
} from '../../lib/documents';
import { HttpError, json, pathParam, queryParam, withHandler, type ApiEvent } from '../../lib/http';
import { getDatasetSchema, requireDocumentShape } from '../../lib/schemas';

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const docId = pathParam(event, 'docId');
  const perspective = requirePerspective(queryParam(event, 'perspective'), 'published');

  // A client that echoes back the id it read from the studio may send the
  // `drafts.`-prefixed one; the id a document is named by is the unprefixed one,
  // and both spellings mean the same document here.
  const id = publishedIdOf(docId);

  // `?shape=schema` by default: what a site renders. The studio asks for `stored`,
  // because an editor edits references rather than the documents they name — and
  // edits every language at once, which is why the stored shape is read in none.
  const shape = requireDocumentShape(queryParam(event, 'shape'));
  const schema = await getDatasetSchema(projectId, dataset);
  const read =
    shape === 'stored'
      ? undefined
      : readLanguages(schema, access.dataset, queryParam(event, 'language'));

  const document = await getDocument(
    projectId,
    dataset,
    id,
    perspective,
    editableFor(access.role),
    read,
  );
  if (!document) {
    throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document ${id} not found`, { documentId: id });
  }

  if (shape === 'stored') return json(document);

  return json(await shapeForDelivery(projectId, dataset, schema, document, perspective, read));
}

export const handler = withHandler(main);
