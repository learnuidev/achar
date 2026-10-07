import type { Asset, AssetKind, AssetUploadTicket, ListResponse } from '@achar/types';

import { queryString, segment, type ApiContext } from '../../lib/context';

/** What an upload reserves: what the file is called, what it is, and how big. */
export interface CreateUploadTicketBody {
  filename: string;
  contentType: string;
  size: number;
}

/**
 * What is written after the bytes have landed.
 *
 * The dimensions are read in the browser before the commit because the browser is
 * where the image is already decoded — an API that wanted them would have to fetch
 * the object back out of S3 to measure it.
 */
export interface CommitAssetBody {
  assetId: string;
  width?: number;
  height?: number;
  blurHash?: string;
}

export interface ListAssetsOptions {
  limit?: number;
  nextToken?: string;
  kind?: AssetKind;
}

/** The asset library, paged like every other list. */
export function listAssets(
  api: ApiContext,
  projectId: string,
  dataset: string,
  options: ListAssetsOptions = {},
): Promise<ListResponse<Asset>> {
  const search = queryString({
    limit: options.limit,
    nextToken: options.nextToken,
    kind: options.kind,
  });
  return api.get<ListResponse<Asset>>(`/v1/assets/${projectId}/${dataset}${search}`);
}

/**
 * Reserves a row and presigns the PUT.
 *
 * The bytes never come through here: the response is a URL that S3 itself
 * accepts, which is the difference between uploading a forty-megabyte video and
 * uploading it twice — once into a Lambda's memory and once into the bucket.
 */
export function createUploadTicket(
  api: ApiContext,
  projectId: string,
  dataset: string,
  body: CreateUploadTicketBody,
): Promise<AssetUploadTicket> {
  return api.post<AssetUploadTicket>(`/v1/assets/${projectId}/${dataset}/upload-url`, body);
}

/** Commits the metadata for bytes that are already in the bucket. */
export function commitAsset(
  api: ApiContext,
  projectId: string,
  dataset: string,
  body: CommitAssetBody,
): Promise<Asset> {
  return api.post<Asset>(`/v1/assets/${projectId}/${dataset}`, body);
}

/** Deletes the object and its row. */
export function deleteAsset(
  api: ApiContext,
  projectId: string,
  dataset: string,
  assetId: string,
): Promise<void> {
  return api.del<void>(`/v1/assets/${projectId}/${dataset}/${segment(assetId)}`);
}
