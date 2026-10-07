/**
 * Assets — the bytes in S3, and the row that describes them.
 *
 * The bytes never pass through a handler. An upload reserves a row, takes a
 * presigned `PUT` and goes straight to S3, which is the only arrangement in
 * which a 40 MB photograph is not also a 40 MB Lambda invocation; the commit
 * that follows is what makes the row real. A reserved row that is never
 * committed is therefore visible in the library as an asset with no size, which
 * is honest: something was started and did not finish.
 *
 * `url` is built on read rather than stored. A distribution that moves, or a
 * domain that is added later, would otherwise orphan every URL a document
 * points at — and the reference a document stores is an asset id, not a URL,
 * precisely so that the two can be decided separately.
 */

import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Asset, AssetKind } from '@achar/types';
import {
  Keys,
  deleteItem,
  getItem,
  putIfAbsent,
  queryAll,
  tryUpdateItem,
  updateItem,
  type Item,
} from './dynamo';
import { env } from './env';
import { HttpError } from './http';
import { shortSuffix } from './ids';

export interface AssetRecord extends Item {
  projectId: string;
  /** `{dataset}#{assetId}` — the range key. */
  assetKey: string;
  /** `{projectId}#{dataset}` — the hash key of `DatasetCreatedIndex`. */
  datasetKey: string;
  assetId: string;
  dataset: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  blurHash?: string | null;
  /** What a document stores in a `_ref`. */
  reference: string;
  /** Where the object lives. Not returned by the API — `url` is. */
  s3Key: string;
  uploadedBy: string;
  createdAt: string;
  committedAt?: string | null;
}

export function assetKeyOf(dataset: string, assetId: string): string {
  return `${dataset}#${assetId}`;
}

export function assetDatasetKeyOf(projectId: string, dataset: string): string {
  return `${projectId}#${dataset}`;
}

let cached: S3Client | undefined;

function s3(): S3Client {
  cached ??= new S3Client({});
  return cached;
}

/** How long a presigned `PUT` is good for. Long enough for a slow upload, short enough to be a ticket. */
export const UPLOAD_TTL_SECONDS = 900;

export function assetUrl(s3Key: string): string {
  const domain = env.assetsCdnDomain;
  // The CDN domain is a host, not a URL, because that is what CloudFront hands
  // out; a deployment that has not set one falls back to the bucket's own
  // regional endpoint so that a stack without the media distribution still
  // serves its images.
  const base = domain ? `https://${domain}` : `https://${env.assetsBucket}.s3.${env.region}.amazonaws.com`;
  return `${base}/${s3Key.split('/').map(encodeURIComponent).join('/')}`;
}

export function toAsset(record: AssetRecord): Asset {
  return {
    assetId: record.assetId,
    projectId: record.projectId,
    dataset: record.dataset,
    kind: record.kind,
    filename: record.filename,
    contentType: record.contentType,
    size: record.size ?? 0,
    width: record.width ?? null,
    height: record.height ?? null,
    blurHash: record.blurHash ?? null,
    reference: record.reference,
    url: assetUrl(record.s3Key),
    uploadedBy: record.uploadedBy,
    createdAt: record.createdAt,
  };
}

/**
 * The string a document stores to point at an asset.
 *
 * An id with the shape of the thing it names — `image-<assetId>-<w>x<h>-<ext>` —
 * because a document is read by people and by tools that never call this API,
 * and a reference that says what it is needs no lookup to be useful. The
 * dimensions are here rather than only on the row so that a reader can lay a
 * page out without a second request.
 *
 * A video carries them the same way, and they are the frame size: a page that
 * knows them can hold the space for a player before its first frame arrives,
 * which is the difference between text that stays put and text that jumps.
 */
export function referenceFor(
  kind: AssetKind,
  assetId: string,
  filename: string,
  dimensions?: { width?: number | null; height?: number | null },
): string {
  const extension = extensionOf(filename);
  if (dimensions?.width && dimensions.height) {
    return `${kind}-${assetId}-${dimensions.width}x${dimensions.height}-${extension}`;
  }
  return `${kind}-${assetId}-${extension}`;
}

function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,8})$/.exec(filename);
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * The asset id inside a reference a document holds.
 *
 * Tolerant on purpose: a reference may be one this API minted, or a bare asset
 * id somebody wrote by hand, and a reader that only understood the first would
 * silently draw no image for the second.
 */
export function assetIdFromReference(value: unknown): string | undefined {
  const reference =
    typeof value === 'string'
      ? value
      : typeof value === 'object' && value !== null && typeof (value as { _ref?: unknown })._ref === 'string'
        ? ((value as { _ref: string })._ref)
        : undefined;
  if (!reference) return undefined;

  const match = /^(?:image|file)-([A-Za-z0-9]+)/.exec(reference);
  return match ? match[1] : reference;
}

export function sanitizeFilename(filename: string): string {
  const cleaned = filename.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^_+/, '');
  return cleaned.slice(0, 120) || 'file';
}

export function s3KeyOf(projectId: string, dataset: string, assetId: string, filename: string): string {
  return `assets/${projectId}/${dataset}/${assetId}/${sanitizeFilename(filename)}`;
}

export function requireAssetKind(value: unknown): AssetKind {
  if (value !== 'image' && value !== 'video' && value !== 'file') {
    throw new HttpError(400, 'BAD_REQUEST', 'kind must be `image`, `video` or `file`', {
      field: 'kind',
    });
  }
  return value;
}

export async function getAsset(
  projectId: string,
  dataset: string,
  assetId: string,
): Promise<AssetRecord | undefined> {
  return getItem<AssetRecord>('AssetsTable', Keys.asset(projectId, assetKeyOf(dataset, assetId)));
}

/**
 * A dataset's assets, newest first.
 *
 * Read through the table's own hash key and filtered here rather than through
 * `DatasetCreatedIndex`: the index is ordered by `createdAt`, and its key is the
 * dataset's, so both work — but a project's assets are almost always wanted
 * whole (the library is drawn as a grid and every reference resolves through
 * it), and one read of one partition is the cheaper way to want that.
 */
export async function listAssets(
  projectId: string,
  dataset: string,
  options: { kind?: AssetKind } = {},
): Promise<AssetRecord[]> {
  const rows = await queryAll<AssetRecord>('AssetsTable', {
    keyCondition: '#projectId = :projectId',
    names: { '#projectId': 'projectId' },
    values: { ':projectId': projectId },
  });

  const prefix = `${dataset}#`;
  return rows
    .filter((row) => row.assetKey.startsWith(prefix))
    .filter((row) => (options.kind ? row.kind === options.kind : true))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface ReserveAssetInput {
  projectId: string;
  dataset: string;
  kind: AssetKind;
  filename: string;
  contentType: string;
  size?: number;
  width?: number | null;
  height?: number | null;
  uploadedBy: string;
}

export interface ReservedAsset {
  record: AssetRecord;
  uploadUrl: string;
  expiresIn: number;
}

export async function reserveAsset(input: ReserveAssetInput): Promise<ReservedAsset> {
  const assetId = `asset_${shortSuffix(12)}`;
  const s3Key = s3KeyOf(input.projectId, input.dataset, assetId, input.filename);
  const now = new Date().toISOString();

  const record: AssetRecord = {
    projectId: input.projectId,
    assetKey: assetKeyOf(input.dataset, assetId),
    datasetKey: assetDatasetKeyOf(input.projectId, input.dataset),
    assetId,
    dataset: input.dataset,
    kind: input.kind,
    filename: sanitizeFilename(input.filename),
    contentType: input.contentType,
    size: input.size ?? 0,
    // Absent rather than `null`, and that is load-bearing rather than tidy: the
    // commit below is conditional on `attribute_not_exists(committedAt)`, and a
    // stored NULL is *present*, so an asset reserved with `committedAt: null`
    // could never be committed — the condition failed, the route read the row back
    // and answered as though it had committed, and the asset sat uncommitted with
    // its dataset's count never moving.
    ...(input.width === undefined || input.width === null ? {} : { width: input.width }),
    ...(input.height === undefined || input.height === null ? {} : { height: input.height }),
    reference: referenceFor(input.kind, assetId, input.filename, {
      width: input.width,
      height: input.height,
    }),
    s3Key,
    uploadedBy: input.uploadedBy,
    createdAt: now,
    // `committedAt` is absent here for the reason above: committing is the
    // transition into it, and "not yet committed" has to be nothing at all.
  };

  // A create, not an update: the id is fresh, and `putIfAbsent` is what would
  // refuse to overwrite a row if it somehow were not.
  const reserved = await putIfAbsent('AssetsTable', record as unknown as Item, 'assetKey');
  if (!reserved) throw new HttpError(409, 'CONFLICT', 'That asset id is already in use');

  const uploadUrl = await getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.assetsBucket,
      Key: s3Key,
      ContentType: input.contentType,
    }),
    { expiresIn: UPLOAD_TTL_SECONDS },
  );

  return { record, uploadUrl, expiresIn: UPLOAD_TTL_SECONDS };
}

export interface CommitAssetInput {
  size?: number;
  contentType?: string;
  width?: number | null;
  height?: number | null;
  blurHash?: string | null;
}

/**
 * Makes a reserved row real.
 *
 * The counter moves only on the transition, which is what the `committedAt`
 * condition is for: committing twice is a retry, not a second asset, and a
 * retried commit that incremented anyway would leave the dataset's count
 * permanently above what the library holds.
 */
export async function commitAsset(
  projectId: string,
  dataset: string,
  assetId: string,
  input: CommitAssetInput,
): Promise<AssetRecord> {
  const existing = await getAsset(projectId, dataset, assetId);
  if (!existing) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found', { assetId });

  const width = input.width ?? existing.width ?? null;
  const height = input.height ?? existing.height ?? null;
  const set: Record<string, unknown> = {
    size: input.size ?? existing.size ?? 0,
    width,
    height,
    blurHash: input.blurHash ?? existing.blurHash ?? null,
    reference: referenceFor(existing.kind, assetId, existing.filename, { width, height }),
    // A commit that follows a reservation measured nothing is still a commit:
    // the size is what the client said, and `committedAt` is what makes the row
    // count. Without this the asset would be listed and never counted.
    committedAt: new Date().toISOString(),
  };
  if (input.contentType) set.contentType = input.contentType;

  const outcome = await tryUpdateItem<AssetRecord>(
    'AssetsTable',
    Keys.asset(projectId, assetKeyOf(dataset, assetId)),
    {
      set,
      condition:
        'attribute_exists(#key) AND (attribute_not_exists(#committedAt) OR attribute_type(#committedAt, :null))',
      names: { '#key': 'assetKey', '#committedAt': 'committedAt' },
      values: { ':null': 'NULL' },
      returnValues: 'ALL_NEW',
    },
  );

  if (!outcome.item) {
    // Either the row is gone or it was already committed; the caller is told
    // which, because a 404 and a "already done" are different things to a client.
    const current = await getAsset(projectId, dataset, assetId);
    if (!current) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found', { assetId });
    return current;
  }

  await updateItem('DatasetsTable', Keys.dataset(projectId, dataset), {
    inc: { assetCount: 1 },
  });
  await updateItem('ProjectsTable', Keys.project(projectId), { set: { updatedAt: new Date().toISOString() } });

  return outcome.item;
}

/**
 * Deletes an asset: the object first, then the row.
 *
 * Children before parents, the same rule the rest of this API deletes by. A
 * failure between the two leaves a row whose bytes are gone — which the library
 * shows, and which deleting again fixes — rather than bytes nobody can reach
 * and nobody can name.
 */
export async function deleteAsset(
  projectId: string,
  dataset: string,
  assetId: string,
): Promise<AssetRecord> {
  const existing = await getAsset(projectId, dataset, assetId);
  if (!existing) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found', { assetId });

  await s3().send(new DeleteObjectCommand({ Bucket: env.assetsBucket, Key: existing.s3Key }));

  const removed = await deleteItem('AssetsTable', Keys.asset(projectId, existing.assetKey), {
    condition: 'attribute_exists(#key)',
    names: { '#key': 'assetKey' },
  });
  if (!removed.deleted) throw new HttpError(404, 'ASSET_NOT_FOUND', 'Asset not found', { assetId });

  if (existing.committedAt) {
    await updateItem('DatasetsTable', Keys.dataset(projectId, dataset), {
      inc: { assetCount: -1 },
    });
  }
  return existing;
}

/** Removes a dataset's assets, objects first. What a dataset delete is made of. */
export async function deleteAssetsOfProject(projectId: string, dataset: string): Promise<number> {
  const rows = await listAssets(projectId, dataset);
  let removed = 0;
  for (const row of rows) {
    try {
      await s3().send(new DeleteObjectCommand({ Bucket: env.assetsBucket, Key: row.s3Key }));
    } catch (error) {
      // An object that is already gone is not a reason to refuse to delete the
      // row that names it: the row is what makes it visible.
      console.warn('Could not delete asset object', row.s3Key, error);
    }
    const result = await deleteItem('AssetsTable', Keys.asset(projectId, row.assetKey));
    if (result.deleted) removed += 1;
  }
  return removed;
}

/**
 * The URL behind each of a page's media references.
 *
 * One read per distinct asset rather than per row: a list of twenty posts
 * illustrated with six images should cost six reads, and the map is handed back
 * so the caller can shape summaries without awaiting anything.
 */
export async function assetUrlsForReferences(
  projectId: string,
  dataset: string,
  references: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(references.map(assetIdFromReference).filter((id): id is string => Boolean(id)))];
  const entries = await Promise.all(
    ids.map(async (assetId) => {
      const record = await getAsset(projectId, dataset, assetId);
      return [assetId, record ? assetUrl(record.s3Key) : ''] as const;
    }),
  );
  return new Map(entries.filter(([, url]) => url !== ''));
}

