/**
 * `POST /v1/assets/{p}/{d}` — the metadata that follows an upload.
 *
 * This is a route of its own because some of what an asset is only exists once
 * the bytes do: how large the object turned out to be, the dimensions a decoder
 * found in it, and the placeholder colour a grid draws before the image arrives.
 * The reservation cannot carry any of that, and a client that knows it only
 * after the `PUT` has nowhere else to say so.
 *
 * `commitAsset` owns the rest: it 404s for a row that was never reserved, is
 * idempotent — a retried commit reports the asset it already made — and moves
 * the dataset's counter only on the transition out of `committedAt: null`, which
 * is what keeps a retry from counting one asset twice.
 */

import type { Asset } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { commitAsset, toAsset } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import { jsonBody, pathParam, requiredStringField, stringField, withHandler, type ApiEvent } from '../../lib/http';

export const handler = withHandler(async (event: ApiEvent) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  await requireDatasetAccess(projectId, dataset, viewer, 'write');

  const body = jsonBody(event);
  const assetId = requiredStringField(body, 'assetId');

  const record = await commitAsset(projectId, dataset, assetId, {
    size: optionalNumber(body, 'size'),
    width: optionalNumber(body, 'width'),
    height: optionalNumber(body, 'height'),
    blurHash: stringField(body, 'blurHash'),
    contentType: stringField(body, 'contentType'),
  });

  const asset: Asset = toAsset(record);
  return asset;
});

/**
 * A number the body may carry, or nothing.
 *
 * Whatever measured the object is a client, and a client's arithmetic is not a
 * reason to write a `NaN` into a row. A value that is not a finite, non-negative
 * number is therefore left out of the commit entirely, which the library reads
 * as "not measured this time" and answers with what the row already held.
 */
function optionalNumber(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}
