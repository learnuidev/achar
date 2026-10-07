import type { Asset, AssetKind } from '@achar/types';

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
    // The route refuses a ticket that does not name a kind, and the content type
    // is where the answer is: the browser already knows whether the bytes it is
    // about to send are an image or a video, and an octet stream — or a type this
    // browser does not know — falls back to the extension, which is the one other
    // thing a name carries.
    kind: kindOf(contentType, nameOf(file)),
    size: file.size,
  });

  await putBytes(ticket.uploadUrl, file, contentType, onProgress);

  return client.commitAsset(projectId, dataset, {
    assetId: ticket.assetId,
    ...(await dimensionsOf(file)),
  });
}

/**
 * Which part of the library a file belongs in.
 *
 * The MIME type first, because it is what the browser actually knows, and the
 * extension second, because a `.mov` dragged out of a folder on some systems
 * arrives with no type at all — and filing a video as a plain file would put it
 * somewhere the video field cannot find it.
 */
function kindOf(contentType: string, filename: string): AssetKind {
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('video/')) return 'video';

  const extension = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1]?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  return 'file';
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'avi', 'mkv', 'mpg', 'mpeg']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'bmp', 'tiff']);

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
  if (file.type.startsWith('image/')) return imageDimensions(file);
  if (file.type.startsWith('video/')) return videoDimensions(file);
  return {};
}

async function imageDimensions(file: File | Blob): Promise<{ width?: number; height?: number }> {
  if (typeof createImageBitmap !== 'function') return {};
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return {};
  }
}

/**
 * A video's frame size, read from its own metadata.
 *
 * The browser has to decode the header to know this, which it does for a `<video>`
 * once it has enough of the file — so this waits for `loadedmetadata` and never for
 * a frame. The object URL is revoked whether it worked or not: a file held by a URL
 * nobody releases is a file the page keeps in memory for as long as it is open, and
 * a forty-minute upload is not a small thing to leak.
 */
function videoDimensions(file: File | Blob): Promise<{ width?: number; height?: number }> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      resolve({});
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';

    const finish = (size: { width?: number; height?: number }): void => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      resolve(size);
    };

    video.onloadedmetadata = () => finish({ width: video.videoWidth, height: video.videoHeight });
    // A codec this browser cannot open is not a reason to refuse the upload: the
    // bytes are still worth keeping, and the dimensions are only a nicety.
    video.onerror = () => finish({});
    video.src = url;
  });
}

function nameOf(file: File | Blob): string {
  // A `Blob` from a paste or a canvas has no name, and an asset library full of
  // rows called `blob` is one nobody can search.
  if (typeof File !== 'undefined' && file instanceof File && file.name) return file.name;
  return 'upload';
}
