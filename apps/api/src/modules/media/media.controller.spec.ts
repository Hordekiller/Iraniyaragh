import { beforeEach, describe, expect, it, vi } from 'vitest';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { MediaController } from './media.controller';

describe('MediaController', () => {
  const service = {
    listAdmin: vi.fn(),
    initiateUpload: vi.fn(),
    confirmUpload: vi.fn(),
    updateMetadata: vi.fn(),
    reorder: vi.fn(),
    archive: vi.fn(),
  };
  const controller = new MediaController(service as never);
  const principal = { userId: 'staff-1' } as never;

  beforeEach(() => vi.clearAllMocks());

  it('declares separate read and write permissions', () => {
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, MediaController.prototype.list)).toBe('STAFF_MFA');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.list)).toBe('catalog.media.read');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.initiateUpload)).toBe('catalog.media.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.confirmUpload)).toBe('catalog.media.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.updateMetadata)).toBe('catalog.media.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.reorder)).toBe('catalog.media.write');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, MediaController.prototype.archive)).toBe('catalog.media.write');
  });

  it('passes actor, idempotency key and route ownership to upload commands', async () => {
    service.confirmUpload.mockResolvedValue({ data: { media: { id: 'media-1' } } });
    await controller.confirmUpload(principal, 'stable-key-123', 'product-1', 'media-1', {});
    expect(service.confirmUpload).toHaveBeenCalledWith(
      'staff-1',
      'stable-key-123',
      'product-1',
      'media-1',
      {},
    );
  });
});
