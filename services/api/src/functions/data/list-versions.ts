/**
 * `GET /v1/data/doc/{p}/{d}/{docId}/versions` — what a document has said.
 *
 * Every time this document was published, newest first. Summaries rather than the
 * documents: a history is a list somebody scrolls, and a document with forty
 * versions is forty documents worth of portable text to draw some dates.
 * `get-version` is the one that answers with the content, and the two are separate
 * routes because they are separate questions.
 *
 * `read` access, like every other way of looking at a dataset's content — a
 * version is content. Restoring one is not: that is a `restore` mutation, which is
 * a write, and which the mutate route authorizes as one.
 */

import { requireDatasetAccess } from '../../lib/access';
import { requireViewer } from '../../lib/auth';
import { publishedIdOf } from '../../lib/documents';
import { json, pathParam, withHandler, type ApiEvent } from '../../lib/http';
import { listVersions } from '../../lib/versions';

async function main(event: ApiEvent) {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  await requireDatasetAccess(projectId, dataset, viewer, 'read');

  // A client that echoed back the id it read from the studio may send the
  // `drafts.`-prefixed one. History belongs to the document, and the document is
  // named by the unprefixed id.
  const documentId = publishedIdOf(pathParam(event, 'docId'));

  return json(await listVersions(projectId, dataset, documentId));
}

export const handler = withHandler(main);
