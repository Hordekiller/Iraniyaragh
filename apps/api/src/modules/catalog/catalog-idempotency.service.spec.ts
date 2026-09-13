import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { CatalogIdempotencyService } from './catalog-idempotency.service';

const storedResponse = { data: { id: 'product-1' } };

function payloadHashOf(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function serviceWithRecord(record: {
  payloadHash: string;
  response: unknown;
  expiresAt: Date;
}) {
  const tx = {
    catalogIdempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: unknown) => callback(tx)),
    catalogIdempotencyRecord: {
      findUnique: vi.fn(),
    },
  };
  (tx.catalogIdempotencyRecord.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(record);
  const service = new CatalogIdempotencyService(prisma as never);
  return { service, tx };
}

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

  it('replays a live stored response without re-executing the mutation', async () => {
    const payload = { name: 'Product' };
    const { service, tx } = serviceWithRecord({
      payloadHash: payloadHashOf(payload),
      response: storedResponse,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const execute = vi.fn();

    const result = await service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: 'replay-key-001',
      payload,
      execute,
    });

    expect(result).toEqual(storedResponse);
    expect(execute).not.toHaveBeenCalled();
    expect(tx.catalogIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('replays a stored response after expiry without re-executing the mutation', async () => {
    const payload = { name: 'Product' };
    const { service, tx } = serviceWithRecord({
      payloadHash: payloadHashOf(payload),
      response: storedResponse,
      expiresAt: new Date(Date.now() - 1),
    });
    const execute = vi.fn();

    const result = await service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: 'expired-key-001',
      payload,
      execute,
    });

    expect(result).toEqual(storedResponse);
    expect(execute).not.toHaveBeenCalled();
    expect(tx.catalogIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('returns IDEMPOTENCY_CONFLICT for a different payload against an expired key', async () => {
    const { service } = serviceWithRecord({
      payloadHash: payloadHashOf({ name: 'Other' }),
      response: storedResponse,
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: 'expired-key-002',
      payload: { name: 'Product' },
      execute: vi.fn(),
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.run({
      actorId: 'actor-1',
      scope: 'catalog.product.create',
      key: 'expired-key-002',
      payload: { name: 'Product' },
      execute: vi.fn(),
    })).rejects.toMatchObject({ response: { code: 'IDEMPOTENCY_CONFLICT' } });
  });
});
