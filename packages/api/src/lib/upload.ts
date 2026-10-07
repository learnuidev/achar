import type { Asset } from '@achar/types';

import type { AcharClient } from './api';

/**
 * Uploads a file and answers with the asset row that now describes it.
 *
 * Three steps, in the order the API expects them: reserve the row and take a
 * presigned URL, PUT the bytes to storage, then commit the metadata. **The bytes
 * never pass through the API** — they go from the browser directly to S3 — which
 * is the difference between uploading a video and uploading it into a Lambda's
 * memory first, against a 6 MB request limit and a bill for the privilege.
 */
export async function uploadAsset(
  client: AcharClient,
  projectId: string,
  dataset: string,
  file: File | Blob,
  onProgress?: (percent: number) => void,
): Promise<Asset> {
  const contentType = file.type || 'application/octet-stream';
  const ticket = await client.createUploadTicket(projectId, dataset, {
    filename: nameOf(file),
    contentType,
    size: file.size,
  });

  await putBytes(ticket.uploadUrl, file, contentType, onProgress);

  return client.commitAsset(projectId, dataset, {
    assetId: ticket.assetId,
    ...(await dimensionsOf(file)),
  });
}

/**
 * The bytes, straight to S3.
 *
 * `fetch` cannot report upload progress — there is no event for it — and these
 * uploads are exactly the ones somebody needs a progress bar for, so this is
 * `XMLHttpRequest`, the one browser API that can say how far along it is.
 */
function putBytes(
  uploadUrl: string,
  file: File | Blob,
  contentType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', uploadUrl);
    request.setRequestHeader('Content-Type', contentType);

    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      };
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`Upload failed (${request.status})`));
    };
    request.onerror = () => reject(new Error('Upload failed: the connection was lost'));
    request.send(file);
  });
}

/**
 * An image's size, measured where the image already is.
 *
 * Sent with the commit because the API would otherwise have to fetch the object
 * back out of S3 and decode it to learn two numbers the browser had in hand
 * before the upload finished. A file that is not an image, or a browser without
 * `createImageBitmap`, simply commits without them.
 */
async function dimensionsOf(file: File | Blob): Promise<{ width?: number; height?: number }> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return {};
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

function nameOf(file: File | Blob): string {
  // A `Blob` from a paste or a canvas has no name, and an asset library full of
  // rows called `blob` is one nobody can search.
  if (typeof File !== 'undefined' && file instanceof File && file.name) return file.name;
  return 'upload';
}
