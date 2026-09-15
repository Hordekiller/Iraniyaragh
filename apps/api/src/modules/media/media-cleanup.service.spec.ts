import { describe, expect, it, vi } from 'vitest';
import { ProductMediaCleanupService } from './media-cleanup.service';

describe('ProductMediaCleanupService', () => {
  it('expires intents and deletes due objects only after consulting database state', async () => {
    const now = new Date('2026-09-15T08:00:00Z');
    const prisma = {
      productMedia: {
        updateMany: vi.fn().mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 }),
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: 'm1', objectKey: 'quarantine/m1', sourceDeleteAt: now }])
          .mockResolvedValueOnce([{ id: 'm2', renditions: [{ objectKey: 'renditions/m2/card.webp' }] }]),
      },
      productMediaRendition: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const storage = { deleteObject: vi.fn() };
    const service = new ProductMediaCleanupService(prisma as never, storage as never);

    await expect(service.sweep(now)).resolves.toEqual({ expired: 2, sources: 1, archived: 1 });
    expect(storage.deleteObject.mock.calls).toEqual([['quarantine/m1'], ['renditions/m2/card.webp']]);
    expect(prisma.productMedia.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ take: 100 }));
  });

  it('does not clear the deletion marker when object storage fails', async () => {
    const prisma = {
      productMedia: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findMany: vi.fn().mockResolvedValueOnce([{ id: 'm1', objectKey: 'quarantine/m1', sourceDeleteAt: new Date() }]),
      },
    };
    const storage = { deleteObject: vi.fn().mockRejectedValue(new Error('unavailable')) };
    const service = new ProductMediaCleanupService(prisma as never, storage as never);
    await expect(service.sweep()).rejects.toThrow('unavailable');
    expect(prisma.productMedia.updateMany).toHaveBeenCalledOnce();
  });
});
