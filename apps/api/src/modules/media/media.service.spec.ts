import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaPolicyService } from "./media-policy.service";
import { MediaService } from "./media.service";

const now = new Date("2026-09-15T06:00:00.000Z");
const input = {
  kind: "IMAGE" as const,
  role: "PRIMARY" as const,
  position: 0,
  originalFilename: "../unsafe\u0000name.jpg",
  declaredMime: "image/jpeg" as const,
  bytes: 1024,
  productVersion: 3,
};

function setup() {
  const tx = {
    product: {
      findUnique: vi.fn().mockResolvedValue({ id: "product-1", version: 3 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    productMedia: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(undefined),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storedMedia = {
    id: "media-id",
    productId: "product-1",
    kind: "IMAGE",
    state: "PENDING_UPLOAD",
    role: "PRIMARY",
    position: 0,
    altText: null,
    caption: null,
    objectKey: "quarantine/products/product-1/media-id/source.jpg",
    originalFilename: "..-unsafe-name.jpg",
    declaredMime: "image/jpeg",
    declaredBytes: 1024n,
    detectedMime: null,
    bytes: null,
    width: null,
    height: null,
    durationMs: null,
    hasAudio: null,
    posterMediaId: null,
    checksumSha256: null,
    failureCode: null,
    version: 1,
    createdById: "actor-1",
    uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    sourceDeleteAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = {
    $transaction: vi.fn().mockImplementation(async (callback) => callback(tx)),
    product: { findUnique: vi.fn().mockResolvedValue({ id: "product-1" }) },
    productMedia: {
      findUnique: vi.fn().mockResolvedValue(storedMedia),
      findFirst: vi.fn().mockResolvedValue(storedMedia),
      findMany: vi.fn().mockResolvedValue([storedMedia]),
    },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const idempotency = {
    run: vi.fn().mockImplementation(async ({ execute }) => {
      const result = await execute(tx);
      if (typeof result.response.mediaId === "string") storedMedia.id = result.response.mediaId;
      return result.response;
    }),
  };
  const storage = {
    presignPut: vi.fn().mockResolvedValue({
      url: "https://storage.test/signed-secret",
      requiredHeaders: { "content-type": "image/jpeg" },
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    }),
    headObject: vi.fn().mockResolvedValue({
      objectKey: storedMedia.objectKey,
      bytes: 1024,
      contentType: "image/jpeg",
      checksumSha256: "a".repeat(64),
    }),
  };
  const processingQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const service = new MediaService(prisma as never, audit as never, idempotency as never, storage as never, processingQueue, new MediaPolicyService());
  tx.productMedia.findFirst.mockImplementation(async () => storedMedia);
  tx.productMedia.findUniqueOrThrow.mockImplementation(async () => storedMedia);
  tx.productMedia.findMany.mockImplementation(async () => [storedMedia]);
  return {
    service,
    prisma,
    audit,
    idempotency,
    storage,
    processingQueue,
    tx,
    storedMedia,
  };
}

describe("MediaService initiateUpload", () => {
  beforeEach(() => vi.useFakeTimers({ now }));

  it("creates a private pending row and signs it after the idempotent transaction", async () => {
    const ctx = setup();

    const response = await ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", input);

    expect(ctx.tx.productMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: "product-1",
        kind: "IMAGE",
        role: "PRIMARY",
        originalFilename: "..-unsafe-name.jpg",
        objectKey: expect.stringMatching(/^quarantine\/products\/product-1\//u),
      }),
    });
    expect(ctx.storage.presignPut).toHaveBeenCalledWith(expect.objectContaining({ contentType: "image/jpeg", bytes: 1024 }));
    expect(response.data.upload.uploadUrl).toContain("signed-secret");

    const idempotentResult = await ctx.idempotency.run.mock.calls[0]![0].execute(ctx.tx);
    expect(JSON.stringify(idempotentResult)).not.toContain("signed-secret");
    expect(JSON.stringify(ctx.audit.record.mock.calls)).not.toContain("signed-secret");
    expect(JSON.stringify(ctx.audit.record.mock.calls)).not.toContain("unsafe");
  });

  it("rejects kind and MIME mismatches before touching persistence", async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", {
        ...input,
        kind: "VIDEO",
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_TYPE_UNSUPPORTED" } });
    expect(ctx.idempotency.run).not.toHaveBeenCalled();
  });

  it("rejects configured size and gallery limits with stable errors", async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", {
        ...input,
        bytes: 20 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    ctx.tx.productMedia.count.mockResolvedValueOnce(12).mockResolvedValueOnce(0);
    await expect(ctx.service.initiateUpload("actor-1", "different-key-123", "product-1", input)).rejects.toMatchObject({ response: { code: "MEDIA_LIMIT_EXCEEDED" } });
  });

  it("rejects positions outside the configured gallery limit before persistence", async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", {
        ...input,
        position: 12,
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_POSITION_CONFLICT" } });
    expect(ctx.idempotency.run).not.toHaveBeenCalled();
  });

  it("requires a newly initiated primary image to occupy position zero", async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", {
        ...input,
        role: "PRIMARY",
        position: 2,
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_POSITION_CONFLICT" } });
    expect(ctx.idempotency.run).not.toHaveBeenCalled();
  });

  it("maps concurrent active-position uniqueness collisions to a stable conflict", async () => {
    const ctx = setup();
    ctx.tx.productMedia.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("position conflict", {
      code: "P2002",
      clientVersion: "6.19.3",
    }));
    await expect(ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", input)).rejects.toMatchObject({
      response: { code: "MEDIA_POSITION_CONFLICT" },
    });
  });

  it("rejects a stale product version before creating media", async () => {
    const ctx = setup();
    ctx.tx.product.findUnique.mockResolvedValue({
      id: "product-1",
      version: 4,
    });

    await expect(ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", input)).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.tx.productMedia.create).not.toHaveBeenCalled();
  });

  it("does not refresh an expired upload intent", async () => {
    const ctx = setup();
    ctx.storedMedia.uploadExpiresAt = new Date(now.getTime() - 1);

    await expect(ctx.service.initiateUpload("actor-1", "stable-key-123", "product-1", input)).rejects.toMatchObject({ response: { code: "MEDIA_UPLOAD_EXPIRED" } });
    expect(ctx.storage.presignPut).not.toHaveBeenCalled();
  });
});

describe("MediaService confirmUpload", () => {
  beforeEach(() => vi.useFakeTimers({ now }));

  it("trusts storage HEAD, atomically advances state and enqueues by stable media id", async () => {
    const ctx = setup();
    ctx.idempotency.run.mockImplementationOnce(async ({ execute }) => {
      const result = await execute(ctx.tx);
      ctx.storedMedia.state = "UPLOADED";
      ctx.storedMedia.version = 2;
      return result.response;
    });

    const result = await ctx.service.confirmUpload("actor-1", "confirm-key-123", "product-1", "media-id", { checksumSha256: "a".repeat(64) });

    expect(ctx.storage.headObject).toHaveBeenCalledWith(ctx.storedMedia.objectKey);
    expect(ctx.tx.productMedia.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "media-id",
        productId: "product-1",
        state: "PENDING_UPLOAD",
      }),
      data: { state: "UPLOADED", version: { increment: 1 } },
    });
    expect(ctx.processingQueue.enqueue).toHaveBeenCalledWith({
      mediaId: "media-id",
      objectKey: ctx.storedMedia.objectKey,
    });
    expect(result.data.media.state).toBe("UPLOADED");
  });

  it("rejects missing and swapped object metadata before persistence", async () => {
    const missing = setup();
    missing.storage.headObject.mockResolvedValue(null);
    await expect(missing.service.confirmUpload("actor-1", "confirm-key-123", "product-1", "media-id", {})).rejects.toMatchObject({ response: { code: "MEDIA_NOT_READY" } });
    expect(missing.idempotency.run).not.toHaveBeenCalled();

    const swapped = setup();
    swapped.storage.headObject.mockResolvedValue({
      objectKey: "quarantine/products/other/media-id/source.jpg",
      bytes: 1024,
      contentType: "image/jpeg",
      checksumSha256: null,
    });
    await expect(swapped.service.confirmUpload("actor-1", "confirm-key-456", "product-1", "media-id", {})).rejects.toMatchObject({ response: { code: "MEDIA_CHECKSUM_MISMATCH" } });
  });

  it("rejects MIME, byte and checksum mismatches with stable errors", async () => {
    const wrongMime = setup();
    wrongMime.storage.headObject.mockResolvedValue({
      objectKey: wrongMime.storedMedia.objectKey,
      bytes: 1024,
      contentType: "text/html",
      checksumSha256: null,
    });
    await expect(wrongMime.service.confirmUpload("actor-1", "confirm-key-123", "product-1", "media-id", {})).rejects.toMatchObject({ response: { code: "MEDIA_TYPE_UNSUPPORTED" } });

    const wrongBytes = setup();
    wrongBytes.storage.headObject.mockResolvedValue({
      objectKey: wrongBytes.storedMedia.objectKey,
      bytes: 2048,
      contentType: "image/jpeg",
      checksumSha256: null,
    });
    await expect(wrongBytes.service.confirmUpload("actor-1", "confirm-key-456", "product-1", "media-id", {})).rejects.toMatchObject({ response: { code: "MEDIA_CHECKSUM_MISMATCH" } });

    const wrongChecksum = setup();
    await expect(
      wrongChecksum.service.confirmUpload("actor-1", "confirm-key-789", "product-1", "media-id", {
        checksumSha256: "b".repeat(64),
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_CHECKSUM_MISMATCH" } });
  });

  it("re-enqueues an uploaded replay without repeating HEAD or state mutation", async () => {
    const ctx = setup();
    ctx.storedMedia.state = "UPLOADED";

    await ctx.service.confirmUpload("actor-1", "confirm-key-123", "product-1", "media-id", {});

    expect(ctx.storage.headObject).not.toHaveBeenCalled();
    expect(ctx.tx.productMedia.updateMany).not.toHaveBeenCalled();
    expect(ctx.processingQueue.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe("MediaService metadata, archive and ordering", () => {
  beforeEach(() => vi.useFakeTimers({ now }));

  it("updates trimmed metadata with optimistic concurrency and safe audit fields", async () => {
    const ctx = setup();
    ctx.storedMedia.state = "READY";
    ctx.tx.productMedia.updateMany.mockImplementationOnce(async () => {
      ctx.storedMedia.altText = "نمای روبرو";
      ctx.storedMedia.caption = null;
      ctx.storedMedia.version = 2;
      return { count: 1 };
    });

    const response = await ctx.service.updateMetadata("actor-1", "metadata-key-123", "product-1", "media-id", {
      expectedVersion: 1,
      altText: "  نمای روبرو  ",
      caption: "   ",
    });

    expect(ctx.tx.productMedia.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "media-id", version: 1 }),
      data: expect.objectContaining({ altText: "نمای روبرو", caption: null }),
    });
    expect(response.data.media.altText).toBe("نمای روبرو");
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "catalog.media.metadata.updated",
        actorId: "actor-1",
      }),
      ctx.tx,
    );
  });

  it("requires a ready same-product poster with the poster role for video", async () => {
    const ctx = setup();
    ctx.storedMedia.kind = "VIDEO";
    ctx.tx.productMedia.findFirst.mockResolvedValueOnce(ctx.storedMedia).mockResolvedValueOnce(null);

    await expect(
      ctx.service.updateMetadata("actor-1", "metadata-key-123", "product-1", "media-id", {
        expectedVersion: 1,
        posterMediaId: "poster-1",
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_POSTER_REQUIRED" } });
    expect(ctx.tx.productMedia.updateMany).not.toHaveBeenCalled();
  });

  it("prevents archiving a poster referenced by active video media", async () => {
    const ctx = setup();
    ctx.storedMedia.state = "READY";
    ctx.tx.productMedia.count.mockResolvedValueOnce(1);

    await expect(ctx.service.archive("actor-1", "archive-key-123", "product-1", "media-id", { expectedVersion: 1 })).rejects.toMatchObject({ response: { code: "MEDIA_POSTER_REQUIRED" } });
  });

  it("prevents archiving the primary image of a published product", async () => {
    const ctx = setup();
    ctx.tx.product.findUnique.mockResolvedValue({
      id: "product-1",
      version: 3,
      status: "ACTIVE",
    });
    await expect(ctx.service.archive("actor-1", "archive-primary-key", "product-1", "media-id", { expectedVersion: 1 })).rejects.toMatchObject({ response: { code: "MEDIA_PRIMARY_REQUIRED" } });
    expect(ctx.tx.productMedia.updateMany).not.toHaveBeenCalled();
  });

  it("archives with a version guard and audit evidence", async () => {
    const ctx = setup();
    ctx.storedMedia.state = "READY";
    ctx.tx.productMedia.count.mockResolvedValueOnce(0);
    ctx.tx.productMedia.updateMany.mockImplementationOnce(async () => {
      ctx.storedMedia.state = "ARCHIVED";
      ctx.storedMedia.archivedAt = now;
      ctx.storedMedia.version = 2;
      return { count: 1 };
    });

    const response = await ctx.service.archive("actor-1", "archive-key-123", "product-1", "media-id", {
      expectedVersion: 1,
    });

    expect(response.data.media.state).toBe("ARCHIVED");
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "catalog.media.archived" }), ctx.tx);
  });

  it("rejects incomplete ordering and preserves primary position zero", async () => {
    const ctx = setup();
    const second = {
      ...ctx.storedMedia,
      id: "media-2",
      role: "GALLERY",
      position: 1,
    };
    ctx.tx.productMedia.findMany.mockResolvedValueOnce([ctx.storedMedia, second]);

    await expect(
      ctx.service.reorder("actor-1", "reorder-key-123", "product-1", {
        expectedProductVersion: 3,
        items: [{ mediaId: "media-id", expectedVersion: 1, position: 0 }],
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_POSITION_CONFLICT" } });

    ctx.tx.productMedia.findMany.mockResolvedValueOnce([ctx.storedMedia, second]);
    await expect(
      ctx.service.reorder("actor-1", "reorder-key-456", "product-1", {
        expectedProductVersion: 3,
        items: [
          { mediaId: "media-id", expectedVersion: 1, position: 1 },
          { mediaId: "media-2", expectedVersion: 1, position: 0 },
        ],
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_POSITION_CONFLICT" } });
  });

  it("reorders through collision-free temporary positions under version guards", async () => {
    const ctx = setup();
    const second = {
      ...ctx.storedMedia,
      id: "media-2",
      role: "GALLERY",
      position: 1,
    };
    ctx.tx.productMedia.findMany.mockResolvedValueOnce([ctx.storedMedia, second]).mockResolvedValueOnce([ctx.storedMedia, second]);

    ctx.prisma.productMedia.findMany.mockResolvedValueOnce([ctx.storedMedia, second]);
    const response = await ctx.service.reorder("actor-1", "reorder-key-123", "product-1", {
      expectedProductVersion: 3,
      items: [
        { mediaId: "media-id", expectedVersion: 1, position: 0 },
        { mediaId: "media-2", expectedVersion: 1, position: 1 },
      ],
    });

    expect(ctx.tx.productMedia.updateMany).toHaveBeenCalledTimes(2);
    expect(ctx.tx.productMedia.update).toHaveBeenCalledTimes(2);
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "catalog.media.reordered" }), ctx.tx);
    expect(response.data.items).toHaveLength(2);
  });
});

describe("MediaService primary selection", () => {
  it("atomically swaps position zero and primary role under version guards", async () => {
    const ctx = setup();
    const primary = {
      ...ctx.storedMedia,
      state: "READY",
      id: "media-primary",
      role: "PRIMARY",
      position: 0,
    };
    const target = {
      ...ctx.storedMedia,
      state: "READY",
      id: "media-target",
      role: "GALLERY",
      position: 1,
    };
    ctx.tx.productMedia.findMany.mockResolvedValue([primary, target]);
    ctx.prisma.productMedia.findMany.mockResolvedValue([target, primary]);

    const response = await ctx.service.setPrimary("actor-1", "primary-key-123", "product-1", "media-target", {
      expectedProductVersion: 3,
      expectedVersion: 1,
    });

    expect(ctx.tx.productMedia.updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ id: "media-primary", version: 1 }),
        data: expect.objectContaining({ role: "GALLERY", position: 1_000_000 }),
      }),
    );
    expect(ctx.tx.productMedia.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ id: "media-target", state: "READY" }),
        data: expect.objectContaining({ role: "PRIMARY", position: 0 }),
      }),
    );
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "catalog.media.primary.changed" }), ctx.tx);
    expect(response.data.items).toHaveLength(2);
  });

  it("rejects a non-ready target before changing the current primary", async () => {
    const ctx = setup();
    ctx.tx.productMedia.findMany.mockResolvedValue([{ ...ctx.storedMedia, role: "GALLERY" }]);
    await expect(
      ctx.service.setPrimary("actor-1", "primary-key-123", "product-1", "media-id", {
        expectedProductVersion: 3,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ response: { code: "MEDIA_NOT_READY" } });
    expect(ctx.tx.productMedia.updateMany).not.toHaveBeenCalled();
  });

  it("demotes the actual primary even when legacy data placed it away from position zero", async () => {
    const ctx = setup();
    const atZero = { ...ctx.storedMedia, state: "READY", id: "media-zero", role: "GALLERY", position: 0 };
    const target = { ...ctx.storedMedia, state: "READY", id: "media-target", role: "GALLERY", position: 1 };
    const legacyPrimary = { ...ctx.storedMedia, state: "READY", id: "media-primary", role: "PRIMARY", position: 2 };
    ctx.tx.productMedia.findMany.mockResolvedValue([atZero, target, legacyPrimary]);
    ctx.prisma.productMedia.findMany.mockResolvedValue([target, atZero, legacyPrimary]);

    await ctx.service.setPrimary("actor-1", "primary-key-legacy", "product-1", "media-target", {
      expectedProductVersion: 3,
      expectedVersion: 1,
    });

    expect(ctx.tx.productMedia.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ id: "media-primary", role: "PRIMARY" }),
      data: expect.objectContaining({ role: "GALLERY" }),
    }));
    expect(ctx.tx.productMedia.updateMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: expect.objectContaining({ id: "media-target" }),
      data: expect.objectContaining({ role: "PRIMARY", position: 0 }),
    }));
  });
});

describe("MediaService listPicker", () => {
  const readyImage = {
    id: "media-image", productId: "product-1", kind: "IMAGE", state: "READY", role: "GALLERY", position: 0,
    altText: "یک عکس", caption: "عنوان", width: 1200, height: 900,
    renditions: [
      { productMediaId: "media-image", objectKey: "products/product-1/media-image/r-600.jpg", format: "jpeg", width: 600, height: 450, bytes: 100n, status: "READY", createdAt: now, updatedAt: now },
      { productMediaId: "media-image", objectKey: "products/product-1/media-image/r-800.jpg", format: "jpeg", width: 800, height: 600, bytes: 200n, status: "READY", createdAt: now, updatedAt: now },
    ],
  };
  const notFound = { ...readyImage, id: "media-no-rendition", width: 800, height: 600, renditions: [] };
  const withoutIntrinsic = { ...readyImage, id: "media-no-intrinsic", width: null, height: null, renditions: [
      { productMediaId: "media-no-intrinsic", objectKey: "products/product-1/media-no-intrinsic/r-800.jpg", format: "jpeg", width: 800, height: 600, bytes: 200n, status: "READY", createdAt: now, updatedAt: now },
    ] };

  function pickerSetup(items: object[]) {
    const prisma = {
      product: { findUnique: vi.fn().mockResolvedValue({ id: "product-1" }) },
      productMedia: { findMany: vi.fn().mockResolvedValue(items) },
    };
    const service = new MediaService(prisma as never, { record: vi.fn() } as never, { run: vi.fn() } as never, {} as never, {} as never, new MediaPolicyService());
    return { service, prisma };
  }

  it("exposes pickable ready images from the widest rendition with matching url and dimensions", async () => {
    const { service, prisma } = pickerSetup([readyImage, notFound, withoutIntrinsic]);

    const response = await service.listPicker("product-1");

    expect(prisma.productMedia.findMany).toHaveBeenCalledWith({
      where: { productId: "product-1", state: "READY", kind: "IMAGE" },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: { renditions: true },
    });
    expect(response.data.items).toEqual([
      {
        id: "media-image",
        url: "http://localhost:9000/products/products/product-1/media-image/r-800.jpg",
        alt: "یک عکس",
        caption: "عنوان",
        width: 800,
        height: 600,
      },
      {
        id: "media-no-intrinsic",
        url: "http://localhost:9000/products/products/product-1/media-no-intrinsic/r-800.jpg",
        alt: "یک عکس",
        caption: "عنوان",
        width: 800,
        height: 600,
      },
    ]);
  });

  it("throws NotFound for unknown products", async () => {
    const { service, prisma } = pickerSetup([]);
    prisma.product.findUnique.mockResolvedValue(null);

    await expect(service.listPicker("missing-product")).rejects.toMatchObject({ response: { code: "NOT_FOUND" } });
  });
});
