import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogIdempotencyService } from './catalog-idempotency.service';

describe('CatalogIdempotencyService', () => {
  it.each([undefined, '', 'short', 'ключ-123', 'a'.repeat(97)])('rejects malformed Idempotency-Key: %s', async key => {
    const service = new CatalogIdempotencyService({} as never);
    await expect(service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: key as string,
      payload: { name: 'Product' },
      execute: vi.fn(),
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not execute the mutation before key validation', async () => {
    const execute = vi.fn();
    const service = new CatalogIdempotencyService({} as never);

    await expect(service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: 'invalid!',
      payload: { name: 'Product' },
      execute,
    })).rejects.toMatchObject({ response: { code: 'VALIDATION_ERROR' } });
    expect(execute).not.toHaveBeenCalled();
  });
});
