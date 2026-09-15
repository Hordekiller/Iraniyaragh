import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPolicyService } from './media-policy.service';
import { MediaService } from './media.service';

const now = new Date('2026-09-15T06:00:00.000Z');
const input = {
  kind: 'IMAGE' as const,
  role: 'PRIMARY' as const,
  position: 0,
  originalFilename: '../unsafe\u0000name.jpg',
  declaredMime: 'image/jpeg' as const,
  bytes: 1024,
  productVersion: 3,
};

function setup() {
  const tx = {
    product: { findUnique: vi.fn().mockResolvedValue({ id: 'product-1', version: 3 }) },
    productMedia: {
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(undefined),
    },
  };
  const storedMedia = {
    id: 'media-id',
    productId: 'product-1',
    kind: 'IMAGE',
    state: 'PENDING_UPLOAD',
    role: 'PRIMARY',
    position: 0,
    altText: null,
    caption: null,
    objectKey: 'quarantine/products/product-1/media-id/source.jpg',
    originalFilename: '..-unsafe-name.jpg',
    declaredMime: 'image/jpeg',
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
    createdById: 'actor-1',
    uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
    sourceDeleteAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const prisma = {
    productMedia: { findUnique: vi.fn().mockResolvedValue(storedMedia) },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const idempotency = {
    run: vi.fn().mockImplementation(async ({ execute }) => {
      const result = await execute(tx);
      storedMedia.id = result.response.mediaId;
      return result.response;
    }),
  };
  const storage = {
    presignPut: vi.fn().mockResolvedValue({
      url: 'https://storage.test/signed-secret',
      requiredHeaders: { 'content-type': 'image/jpeg' },
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
    }),
  };
  const service = new MediaService(
    prisma as never,
    audit as never,
    idempotency as never,
    storage as never,
    new MediaPolicyService(),
  );
  return { service, prisma, audit, idempotency, storage, tx, storedMedia };
}

describe('MediaService initiateUpload', () => {
  beforeEach(() => vi.useFakeTimers({ now }));

  it('creates a private pending row and signs it after the idempotent transaction', async () => {
    const ctx = setup();

    const response = await ctx.service.initiateUpload('actor-1', 'stable-key-123', 'product-1', input);

    expect(ctx.tx.productMedia.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productId: 'product-1',
        kind: 'IMAGE',
        role: 'PRIMARY',
        originalFilename: '..-unsafe-name.jpg',
        objectKey: expect.stringMatching(/^quarantine\/products\/product-1\//u),
      }),
    });
    expect(ctx.storage.presignPut).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/jpeg', bytes: 1024 }),
    );
    expect(response.data.upload.uploadUrl).toContain('signed-secret');

    const idempotentResult = await ctx.idempotency.run.mock.calls[0]![0].execute(ctx.tx);
    expect(JSON.stringify(idempotentResult)).not.toContain('signed-secret');
    expect(JSON.stringify(ctx.audit.record.mock.calls)).not.toContain('signed-secret');
    expect(JSON.stringify(ctx.audit.record.mock.calls)).not.toContain('unsafe');
  });

  it('rejects kind and MIME mismatches before touching persistence', async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload('actor-1', 'stable-key-123', 'product-1', {
        ...input,
        kind: 'VIDEO',
      }),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_TYPE_UNSUPPORTED' } });
    expect(ctx.idempotency.run).not.toHaveBeenCalled();
  });

  it('rejects configured size and gallery limits with stable errors', async () => {
    const ctx = setup();
    await expect(
      ctx.service.initiateUpload('actor-1', 'stable-key-123', 'product-1', {
        ...input,
        bytes: 20 * 1024 * 1024 + 1,
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    ctx.tx.productMedia.count.mockResolvedValueOnce(12).mockResolvedValueOnce(0);
    await expect(
      ctx.service.initiateUpload('actor-1', 'different-key-123', 'product-1', input),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_LIMIT_EXCEEDED' } });
  });

  it('rejects a stale product version before creating media', async () => {
    const ctx = setup();
    ctx.tx.product.findUnique.mockResolvedValue({ id: 'product-1', version: 4 });

    await expect(
      ctx.service.initiateUpload('actor-1', 'stable-key-123', 'product-1', input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(ctx.tx.productMedia.create).not.toHaveBeenCalled();
  });

  it('does not refresh an expired upload intent', async () => {
    const ctx = setup();
    ctx.storedMedia.uploadExpiresAt = new Date(now.getTime() - 1);

    await expect(
      ctx.service.initiateUpload('actor-1', 'stable-key-123', 'product-1', input),
    ).rejects.toMatchObject({ response: { code: 'MEDIA_UPLOAD_EXPIRED' } });
    expect(ctx.storage.presignPut).not.toHaveBeenCalled();
  });
});
