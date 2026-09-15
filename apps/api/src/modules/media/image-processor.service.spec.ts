import { Readable } from 'node:stream';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { ProductMediaImageProcessor } from './image-processor.service';

async function setup(scan: 'CLEAN' | 'INFECTED' | 'UNAVAILABLE' = 'CLEAN') {
  const source = await sharp({ create: { width: 64, height: 32, channels: 3, background: '#cc3300' } }).png().toBuffer();
  const media = { id: 'media-1', productId: 'product-1', state: 'UPLOADED', kind: 'IMAGE', version: 1, objectKey: 'quarantine/products/product-1/media-1/source.png', declaredMime: 'image/png' };
  const tx = { productMediaRendition: { deleteMany: vi.fn(), createMany: vi.fn() }, productMedia: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const prisma = {
    productMedia: { findUnique: vi.fn().mockResolvedValue(media), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    $transaction: vi.fn(async callback => callback(tx)),
  };
  const storage = { getObject: vi.fn().mockResolvedValue(Readable.from(source)), putObject: vi.fn() };
  const scanner = { scan: vi.fn().mockResolvedValue(scan) };
  const policy = { imageMaxBytes: 20 * 1024 * 1024, maxImagePixels: 40_000_000 };
  const processor = new ProductMediaImageProcessor(prisma as never, storage as never, scanner, policy as never);
  return { processor, prisma, storage, scanner, tx, media };
}

describe('ProductMediaImageProcessor', () => {
  it('publishes a complete immutable rendition set atomically', async () => {
    const ctx = await setup();
    await ctx.processor.process('media-1');
    expect(ctx.storage.putObject).toHaveBeenCalledTimes(10);
    expect(ctx.tx.productMediaRendition.createMany).toHaveBeenCalledWith({ data: expect.arrayContaining([
      expect.objectContaining({ purpose: 'THUMBNAIL', format: 'webp', width: 64, height: 32 }),
      expect.objectContaining({ purpose: 'DETAIL_LG', format: 'jpeg', width: 64, height: 32 }),
    ]) });
    expect(ctx.tx.productMedia.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'media-1', state: 'PROCESSING' },
      data: expect.objectContaining({ state: 'READY', detectedMime: 'image/png', width: 64, height: 32 }),
    }));
  });

  it('fails closed when the scanner is unavailable', async () => {
    const ctx = await setup('UNAVAILABLE');
    await expect(ctx.processor.process('media-1')).rejects.toThrow('MEDIA_SCANNER_UNAVAILABLE');
    expect(ctx.storage.putObject).not.toHaveBeenCalled();
    expect(ctx.prisma.productMedia.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ state: 'FAILED', failureCode: 'MEDIA_SCANNER_UNAVAILABLE' }) }));
  });

  it('keeps transient failures retryable until BullMQ reaches its final attempt', async () => {
    const ctx = await setup('UNAVAILABLE');
    await expect(ctx.processor.process('media-1', { finalAttempt: false })).rejects.toThrow('MEDIA_SCANNER_UNAVAILABLE');
    expect(ctx.prisma.productMedia.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: { failureCode: 'MEDIA_SCANNER_UNAVAILABLE' },
    }));
  });

  it('retries an interrupted processing state without changing the final version key', async () => {
    const ctx = await setup();
    ctx.prisma.productMedia.findUnique.mockResolvedValue({ ...ctx.media, state: 'PROCESSING', version: 2 });
    await ctx.processor.process('media-1');
    expect(ctx.prisma.productMedia.updateMany).not.toHaveBeenCalled();
    expect(ctx.storage.putObject).toHaveBeenCalledWith(expect.objectContaining({
      objectKey: expect.stringContaining('/v3/'),
    }));
  });

  it('rejects signature and declared MIME mismatches before scanning', async () => {
    const ctx = await setup();
    ctx.prisma.productMedia.findUnique.mockResolvedValue({ ...ctx.media, declaredMime: 'image/jpeg' });
    await expect(ctx.processor.process('media-1')).rejects.toThrow('MEDIA_TYPE_UNSUPPORTED');
    expect(ctx.scanner.scan).not.toHaveBeenCalled();
  });
});
