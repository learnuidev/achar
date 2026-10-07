/**
 * `POST /v1/assets/{p}/{d}/upload-url` — reserve a row and presign a `PUT`.
 *
 * Both halves are one request because a client cannot do them separately: the
 * row has to exist before the bytes have a name, and the key the bytes go to has
 * to be signed before they can be sent. The ticket answers with both, so an
 * upload is one round trip to this API and one to S3.
 *
 * The bytes never pass through a handler. A presigned `PUT` carries them from
 * the browser straight to the bucket, which is the only arrangement in which a
 * 40 MB photograph is not also a 40 MB Lambda invocation. Recording what landed
 * is the commit's job, which is a second route because it carries what only the
 * finished upload can know.
 */

import type { AssetUploadTicket } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { requireAssetKind, reserveAsset, toAsset } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import {
  created,
  jsonBody,
  pathParam,
  requiredStringField,
  stringField,
  withHandler,
  type ApiEvent,
} from '../../lib/http';

export const handler = withHandler(async (event: ApiEvent) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const filename = requiredStringField(body, 'filename');
  const contentType = requiredStringField(body, 'contentType');
  const kind = requireAssetKind(stringField(body, 'kind'));

  const { record, uploadUrl, expiresIn } = await reserveAsset({
    projectId,
    dataset,
    kind,
    filename,
    contentType,
    size: optionalNumber(body, 'size'),
    width: optionalNumber(body, 'width'),
    height: optionalNumber(body, 'height'),
    uploadedBy: viewer.userId,
  });

  return created({
    assetId: record.assetId,
    uploadUrl,
    url: toAsset(record).url,
    reference: record.reference,
    expiresIn,
  } satisfies AssetUploadTicket);
});

/**
 * A number the body may carry, or nothing.
 *
 * `size`, `width` and `height` are hints — a studio measures them before it
 * uploads when it can — so anything that is not a finite, non-negative number is
 * ignored rather than refused. The row does not depend on them: the commit is
 * what measures, and an upload refused over a dimension a client formatted as a
 * string is an upload nobody can explain.
 */
function optionalNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}
