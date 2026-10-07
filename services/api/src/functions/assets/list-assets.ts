/**
 * `GET /v1/assets/{p}/{d}` — a dataset's asset library.
 *
 * The whole library comes back in one answer rather than a page of it. It is
 * drawn as a grid and every `_ref` in every document resolves through it, so a
 * caller wants the set, not the newest twenty-five of it: paging one query over
 * one partition would charge every screen in the studio for assembling it again,
 * and `nextToken` would be a promise this route has no reason to make.
 *
 * `?kind=image|file` is the one filter, because an image picker in a rich-text
 * field and a download field are different screens over the same rows.
 */

import type { Asset, ListResponse } from '@achar/types';
import { requireDatasetAccess } from '../../lib/access';
import { listAssets, requireAssetKind, toAsset } from '../../lib/assets';
import { requireViewer } from '../../lib/auth';
import { pathParam, queryParam, withHandler, type ApiEvent } from '../../lib/http';

export const handler = withHandler(async (event: ApiEvent) => {
  const viewer = await requireViewer(event);
  const projectId = pathParam(event, 'projectId');
  const dataset = pathParam(event, 'dataset');
  await requireDatasetAccess(projectId, dataset, viewer, 'read');

  const kind = queryParam(event, 'kind');
  const rows = await listAssets(projectId, dataset, kind ? { kind: requireAssetKind(kind) } : {});

  return { items: rows.map(toAsset), nextToken: null } satisfies ListResponse<Asset>;
});
