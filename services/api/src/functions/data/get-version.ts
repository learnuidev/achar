/**
 * `GET /v1/data/doc/{p}/{d}/{docId}/versions/{version}` — one version, as it was.
 *
 * The document is answered exactly as a client would have read it at the moment it
 * was published: the same fields, the same `_rev`, the same `_updatedAt`. That is
 * the point of a snapshot — anything derived on the way out would be a version
 * seen through today's code, and "what did this say in March" is a question about
 * March.
 *
 * A version that does not exist is a 404 naming the version, and a version of a
 * document that is gone answers the same: `delete` takes a document's history with
 * it, so there is nothing left to be wrong about.
 *
 * `?language=` is honoured here as it is on a live read, because what is stored is
 * every language and what a client asked for is one: a version is a document as a
 * client would have read it. The record around the document — the version number,
 * who published it — is not content and is not translated.
 */

import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { inLanguage, publishedIdOf, readLanguages } from '../../lib/documents';
import { HttpError, json, pathParam, queryParam, withHandler, type ApiEvent } from '../../lib/http';
import { getDatasetSchema } from '../../lib/schemas';
import { getVersion } from '../../lib/versions';

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  const access = await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const documentId = publishedIdOf(pathParam(event, 'docId'));
  const version = Number(pathParam(event, 'version'));
  if (!Number.isInteger(version) || version < 1) {
    throw new HttpError(400, 'BAD_REQUEST', 'A version is a positive whole number', { version });
  }

  const found = await getVersion(projectId, dataset, documentId, version);
  if (!found) {
    throw new HttpError(
      404,
      'VERSION_NOT_FOUND',
      `Document ${documentId} has no version ${version}`,
      { documentId, version },
    );
  }

  const read = readLanguages(
    await getDatasetSchema(projectId, dataset),
    access.dataset,
    queryParam(event, 'language'),
  );

  return json({ ...found, document: inLanguage(found.document, read) });
}

export const handler = withHandler(main);
