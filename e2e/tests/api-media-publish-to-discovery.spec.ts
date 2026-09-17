import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { APIRequestContext, APIResponse } from "@playwright/test";

/**
 * Real-HTTP evidence for the product-media vertical: draft -> upload intent ->
 * MinIO PUT -> confirm -> worker processing -> metadata -> primary -> publish ->
 * public discovery, plus the denial/failure paths the publish guard must hold.
 *
 * Requires the API, the media worker and S3-compatible object storage (MinIO) to
 * be running with `AUTH_DEV_CODE` set and the dev admin seeded. The e2e job in
 * .github/workflows/ci.yml brings these up; locally see infrastructure/docker.
 */

const API = "/api/v1";
const DEV_CODE = process.env.AUTH_DEV_CODE;
const SAMPLE_IMAGE = resolve(
  __dirname,
  "../../apps/web/public/images/hero1.jpg",
);
const IMAGE_MAX_BYTES = 20 * 1024 * 1024;

type UploadIntent = {
  mediaId: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
};

type Product = { id: string; slug: string; version: number; status: string };

type MediaRow = {
  id: string;
  state:
    | "PENDING_UPLOAD"
    | "UPLOADED"
    | "PROCESSING"
    | "READY"
    | "FAILED"
    | "ARCHIVED";
  role: string;
  position: number;
  version: number;
  altText: string | null;
  width: number | null;
  height: number | null;
};

function adminHeaders(
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
    ...extra,
  };
}

function newKey(): string {
  return randomUUID();
}

async function signIn(request: APIRequestContext): Promise<string> {
  if (!DEV_CODE)
    throw new Error(
      "AUTH_DEV_CODE must be set to sign in to the admin API in e2e.",
    );
  const response = await request.post(`${API}/auth/dev/signin`, {
    data: { code: DEV_CODE, deviceName: `media-e2e-${randomUUID()}` },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

async function createDraftProduct(
  request: APIRequestContext,
  token: string,
): Promise<Product> {
  const slug = `media-e2e-${randomUUID()}`;
  const response = await request.post(`${API}/catalog/admin/products`, {
    headers: adminHeaders(token, { "idempotency-key": newKey() }),
    data: {
      name: "Product media E2E",
      slug,
      status: "DRAFT",
      variants: [
        {
          sku: slug,
          costPrice: { amount: "100000", currency: "IRR" },
          salePrice: { amount: "200000", currency: "IRR" },
          isActive: true,
        },
      ],
    },
  });
  expect(response.status()).toBe(201);
  const body = (await response.json()) as { data: { product: Product } };
  return body.data.product;
}

async function listMedia(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<MediaRow[]> {
  const response = await request.get(
    `${API}/catalog/admin/products/${productId}/media`,
    {
      headers: adminHeaders(token),
    },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { data: { items: MediaRow[] } };
  return body.data.items;
}

async function waitForMedia(
  request: APIRequestContext,
  token: string,
  productId: string,
  mediaId: string,
  timeoutMs = 30_000,
): Promise<MediaRow> {
  const deadline = Date.now() + timeoutMs;
  let row: MediaRow | undefined;
  while (Date.now() < deadline) {
    row = (await listMedia(request, token, productId)).find(
      (item) => item.id === mediaId,
    );
    if (row && (row.state === "READY" || row.state === "FAILED")) return row;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(
    `media ${mediaId} did not settle before timeout: ${JSON.stringify(row)}`,
  );
}

async function uploadImage(
  request: APIRequestContext,
  token: string,
  product: Product,
): Promise<{ mediaId: string; confirmKey: string }> {
  const bytes = readFileSync(SAMPLE_IMAGE);
  const intentResponse = await request.post(
    `${API}/catalog/admin/products/${product.id}/media/uploads`,
    {
      headers: adminHeaders(token, { "idempotency-key": newKey() }),
      data: {
        kind: "IMAGE",
        role: "PRIMARY",
        position: 0,
        originalFilename: "hero1.jpg",
        declaredMime: "image/jpeg",
        bytes: bytes.byteLength,
        productVersion: product.version,
      },
    },
  );
  expect(intentResponse.status()).toBe(201);
  const intent = (
    (await intentResponse.json()) as { data: { upload: UploadIntent } }
  ).data.upload;

  const put = await request.put(intent.uploadUrl, {
    headers: intent.requiredHeaders,
    data: bytes,
  });
  expect(put.status()).toBe(200);

  const confirmKey = newKey();
  const confirm = await request.post(
    `${API}/catalog/admin/products/${product.id}/media/${intent.mediaId}/confirm`,
    {
      headers: adminHeaders(token, { "idempotency-key": confirmKey }),
      data: {},
    },
  );
  expect(confirm.status()).toBe(201);
  return { mediaId: intent.mediaId, confirmKey };
}

async function errorCode(response: APIResponse): Promise<string> {
  const body = (await response.json()) as { code?: string };
  return body.code ?? "";
}

async function readProduct(
  request: APIRequestContext,
  token: string,
  productId: string,
): Promise<Product> {
  const response = await request.get(
    `${API}/catalog/admin/products/${productId}`,
    { headers: adminHeaders(token) },
  );
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { data: { product: Product } };
  return body.data.product;
}

test.describe("api: product media publish-to-discovery (#165)", () => {
  test("publishes an image end to end and serves it through public discovery and object storage", async ({
    request,
  }) => {
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);

    const { mediaId } = await uploadImage(request, token, product);
    const ready = await waitForMedia(request, token, product.id, mediaId);
    expect(ready.state).toBe("READY");
    expect(ready.width).toBeGreaterThan(0);
    expect(ready.height).toBeGreaterThan(0);

    const alt = "دریل چکشی برای آزمون رسانه";
    const metadata = await request.patch(
      `${API}/catalog/admin/products/${product.id}/media/${mediaId}`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: { expectedVersion: ready.version, altText: alt },
      },
    );
    expect(metadata.status()).toBe(200);
    const updated = ((await metadata.json()) as { data: { media: MediaRow } })
      .data.media;

    const current = await readProduct(request, token, product.id);
    const primary = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/${mediaId}/primary`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          expectedProductVersion: current.version,
          expectedVersion: updated.version,
        },
      },
    );
    expect(primary.status()).toBe(201);

    const publish = await request.post(
      `${API}/catalog/admin/products/${product.id}/status`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: { action: "publish" },
      },
    );
    expect(publish.status()).toBe(201);
    expect(
      ((await publish.json()) as { data: { product: Product } }).data.product
        .status,
    ).toBe("PUBLISHED");

    const publicResponse = await request.get(
      `${API}/catalog/products/${product.slug}`,
    );
    expect(publicResponse.status()).toBe(200);
    const publicProduct = (
      (await publicResponse.json()) as {
        data: {
          product: {
            media: Array<{
              id: string;
              kind: string;
              role: string;
              alt: string;
              sources: Array<{
                url: string;
                width: number;
                height: number;
                type: string;
              }>;
            }>;
          };
        };
      }
    ).data.product;

    expect(publicProduct.media).toHaveLength(1);
    const [image] = publicProduct.media;
    expect(image.id).toBe(mediaId);
    expect(image.kind).toBe("IMAGE");
    expect(image.role).toBe("PRIMARY");
    expect(image.alt).toBe(alt);
    expect(image.sources.length).toBeGreaterThanOrEqual(2);
    expect(image.sources.some((source) => source.type === "image/webp")).toBe(
      true,
    );
    expect(image.sources.some((source) => source.type === "image/jpeg")).toBe(
      true,
    );
    const widths = image.sources.map((source) => source.width);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));

    const smallest = image.sources[0];
    const asset = await request.get(smallest.url);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("image/webp");
    expect(asset.headers()["cache-control"]).toContain("immutable");
    expect(asset.headers()["etag"]).toBeTruthy();
  });

  test("refuses to publish without a ready primary image", async ({
    request,
  }) => {
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);

    const publish = await request.post(
      `${API}/catalog/admin/products/${product.id}/status`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: { action: "publish" },
      },
    );
    expect(publish.status()).toBe(422);
    expect(await errorCode(publish)).toBe("MEDIA_PRIMARY_REQUIRED");
  });

  test("rejects oversized and type-mismatched upload intents", async ({
    request,
  }) => {
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);

    const oversized = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/uploads`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          kind: "IMAGE",
          role: "PRIMARY",
          position: 0,
          originalFilename: "huge.jpg",
          declaredMime: "image/jpeg",
          bytes: IMAGE_MAX_BYTES + 1,
          productVersion: product.version,
        },
      },
    );
    expect(oversized.status()).toBe(422);
    expect(await errorCode(oversized)).toBe("MEDIA_TOO_LARGE");

    const mismatched = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/uploads`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          kind: "VIDEO",
          role: "GALLERY",
          position: 1,
          originalFilename: "clip.mp4",
          declaredMime: "image/png",
          bytes: 1024,
          productVersion: product.version,
        },
      },
    );
    expect(mismatched.status()).toBe(422);
    expect(await errorCode(mismatched)).toBe("MEDIA_TYPE_UNSUPPORTED");
  });

  test("refuses to confirm an object that was never uploaded and rejects stale metadata", async ({
    request,
  }) => {
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);

    const bytes = readFileSync(SAMPLE_IMAGE);
    const intentResponse = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/uploads`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          kind: "IMAGE",
          role: "PRIMARY",
          position: 0,
          originalFilename: "missing.jpg",
          declaredMime: "image/jpeg",
          bytes: bytes.byteLength,
          productVersion: product.version,
        },
      },
    );
    expect(intentResponse.status()).toBe(201);
    const intent = (
      (await intentResponse.json()) as { data: { upload: UploadIntent } }
    ).data.upload;

    const confirm = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/${intent.mediaId}/confirm`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {},
      },
    );
    expect(confirm.status()).toBe(422);
    expect(await errorCode(confirm)).toBe("MEDIA_NOT_READY");

    const other = await createDraftProduct(request, token);
    const { mediaId } = await uploadImage(request, token, other);
    const ready = await waitForMedia(request, token, other.id, mediaId);
    expect(ready.state).toBe("READY");

    const stale = await request.patch(
      `${API}/catalog/admin/products/${other.id}/media/${mediaId}`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: { expectedVersion: ready.version + 5, altText: "stale" },
      },
    );
    expect(stale.status()).toBe(409);
    expect(await errorCode(stale)).toBe("STALE_VERSION");
  });

  test("replays a retried confirm idempotently without duplicating the media", async ({
    request,
  }) => {
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);

    const bytes = readFileSync(SAMPLE_IMAGE);
    const intentResponse = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/uploads`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          kind: "IMAGE",
          role: "PRIMARY",
          position: 0,
          originalFilename: "hero1.jpg",
          declaredMime: "image/jpeg",
          bytes: bytes.byteLength,
          productVersion: product.version,
        },
      },
    );
    expect(intentResponse.status()).toBe(201);
    const intent = (
      (await intentResponse.json()) as { data: { upload: UploadIntent } }
    ).data.upload;
    expect(
      (
        await request.put(intent.uploadUrl, {
          headers: intent.requiredHeaders,
          data: bytes,
        })
      ).status(),
    ).toBe(200);

    const confirmKey = newKey();
    const first = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/${intent.mediaId}/confirm`,
      {
        headers: adminHeaders(token, { "idempotency-key": confirmKey }),
        data: {},
      },
    );
    expect(first.status()).toBe(201);

    const replay = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/${intent.mediaId}/confirm`,
      {
        headers: adminHeaders(token, { "idempotency-key": confirmKey }),
        data: {},
      },
    );
    expect(replay.status()).toBe(201);
    const replayed = ((await replay.json()) as { data: { media: MediaRow } })
      .data.media;
    expect(replayed.id).toBe(intent.mediaId);
    expect(["UPLOADED", "PROCESSING", "READY"]).toContain(replayed.state);

    const items = await listMedia(request, token, product.id);
    expect(items.filter((item) => item.id === intent.mediaId)).toHaveLength(1);
  });

  test("keeps a published product with no alt text out of public media projection", async ({
    request,
  }) => {
    // Documents today's gap: publish only requires exactly one READY primary
    // image, while public discovery additionally requires altText. The product
    // is therefore published but exposes no media until alt text is set.
    const token = await signIn(request);
    const product = await createDraftProduct(request, token);
    const { mediaId } = await uploadImage(request, token, product);
    const ready = await waitForMedia(request, token, product.id, mediaId);
    expect(ready.state).toBe("READY");
    expect(ready.altText).toBeNull();

    const current = await readProduct(request, token, product.id);
    const primary = await request.post(
      `${API}/catalog/admin/products/${product.id}/media/${mediaId}/primary`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: {
          expectedProductVersion: current.version,
          expectedVersion: ready.version,
        },
      },
    );
    expect(primary.status()).toBe(201);

    const publish = await request.post(
      `${API}/catalog/admin/products/${product.id}/status`,
      {
        headers: adminHeaders(token, { "idempotency-key": newKey() }),
        data: { action: "publish" },
      },
    );
    expect(publish.status()).toBe(201);

    const publicResponse = await request.get(
      `${API}/catalog/products/${product.slug}`,
    );
    expect(publicResponse.status()).toBe(200);
    const publicProduct = (await publicResponse.json()) as {
      data: { product: { media: unknown[] } };
    };
    expect(publicProduct.data.product.media).toHaveLength(0);
  });
});
