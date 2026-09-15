import type {
  AdminProductMedia,
  AdminProductMediaListResponse,
  AdminProductMediaResponse,
  ProductMediaMetadataRequest,
  ProductMediaPrimaryRequest,
  ProductMediaReorderRequest,
  ProductMediaUploadRequest,
  ProductMediaUploadResponse,
} from "@iranyaragh/contracts";
import { apiFetch, ApiNetworkError } from "@/lib/api/client";
import { getAccessToken } from "@/lib/auth/token-store";
import { createIdempotencyKey } from "./catalog-api";

const token = () => getAccessToken();
const root = (productId: string) =>
  `/catalog/admin/products/${productId}/media`;

export async function listProductMedia(
  productId: string,
  signal?: AbortSignal,
): Promise<AdminProductMedia[]> {
  const response = await apiFetch<AdminProductMediaListResponse["data"]>(
    root(productId),
    { token: token(), signal },
  );
  return response.data.items;
}

export async function initiateMediaUpload(
  productId: string,
  input: ProductMediaUploadRequest,
) {
  const response = await apiFetch<ProductMediaUploadResponse["data"]>(
    `${root(productId)}/uploads`,
    {
      method: "POST",
      token: token(),
      body: input,
      headers: { "Idempotency-Key": createIdempotencyKey("media-upload") },
    },
  );
  return response.data.upload;
}

export function uploadMediaObject(
  upload: ProductMediaUploadResponse["data"]["upload"],
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(upload.method, upload.uploadUrl);
    for (const [name, value] of Object.entries(upload.requiredHeaders))
      request.setRequestHeader(name, value);
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    });
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else
        reject(
          new ApiNetworkError("ارسال فایل به فضای ذخیره‌سازی ناموفق بود."),
        );
    });
    request.addEventListener("error", () =>
      reject(new ApiNetworkError("ارتباط با فضای ذخیره‌سازی برقرار نشد.")),
    );
    request.addEventListener("abort", () =>
      reject(new ApiNetworkError("ارسال فایل لغو شد.")),
    );
    request.send(file);
  });
}

export async function confirmMediaUpload(
  productId: string,
  mediaId: string,
): Promise<AdminProductMedia> {
  const response = await apiFetch<AdminProductMediaResponse["data"]>(
    `${root(productId)}/${mediaId}/confirm`,
    {
      method: "POST",
      token: token(),
      body: {},
      headers: { "Idempotency-Key": createIdempotencyKey("media-confirm") },
    },
  );
  return response.data.media;
}

export async function updateMediaMetadata(
  productId: string,
  mediaId: string,
  input: ProductMediaMetadataRequest,
) {
  const response = await apiFetch<AdminProductMediaResponse["data"]>(
    `${root(productId)}/${mediaId}`,
    {
      method: "PATCH",
      token: token(),
      body: input,
      headers: { "Idempotency-Key": createIdempotencyKey("media-metadata") },
    },
  );
  return response.data.media;
}

export async function archiveMedia(
  productId: string,
  mediaId: string,
  expectedVersion: number,
) {
  await apiFetch<AdminProductMediaResponse["data"]>(
    `${root(productId)}/${mediaId}/archive`,
    {
      method: "POST",
      token: token(),
      body: { expectedVersion },
      headers: { "Idempotency-Key": createIdempotencyKey("media-archive") },
    },
  );
}

export async function reorderMedia(
  productId: string,
  input: ProductMediaReorderRequest,
) {
  const response = await apiFetch<AdminProductMediaListResponse["data"]>(
    `${root(productId)}/reorder`,
    {
      method: "POST",
      token: token(),
      body: input,
      headers: { "Idempotency-Key": createIdempotencyKey("media-order") },
    },
  );
  return response.data.items;
}

export async function setPrimaryMedia(
  productId: string,
  mediaId: string,
  input: ProductMediaPrimaryRequest,
) {
  const response = await apiFetch<AdminProductMediaListResponse["data"]>(
    `${root(productId)}/${mediaId}/primary`,
    {
      method: "POST",
      token: token(),
      body: input,
      headers: { "Idempotency-Key": createIdempotencyKey("media-primary") },
    },
  );
  return response.data.items;
}
