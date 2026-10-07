import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
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
    $executeRaw: vi.fn().mockResolvedValue(1),
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
  return { service, tx, prisma };
}

describe('CatalogIdempotencyService', () => {
  const rawFailure = (sqlState: string) => new Prisma.PrismaClientKnownRequestError('Raw query failed.', {
    code: 'P2010', clientVersion: 'test', meta: { code: sqlState },
  });

  it.each(['40001', '40P01'])('retries the whole aborted transaction for raw SQLSTATE %s with the same replay record', async sqlState => {
    const payload = { name: 'Product' };
    const { service, tx, prisma } = serviceWithRecord({ payloadHash: payloadHashOf(payload), response: storedResponse, expiresAt: new Date(Date.now() + 60_000) });
    tx.$executeRaw.mockRejectedValueOnce(rawFailure(sqlState));
    const execute = vi.fn();
    await expect(service.run({ actorId: 'actor-1', scope: 'catalog.product.create', key: 'raw-conflict-test', payload, execute })).resolves.toEqual(storedResponse);
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(execute).not.toHaveBeenCalled();
    expect(tx.catalogIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it('returns a stable conflict after exactly three aborted raw transactions, never a success', async () => {
    const payload = { name: 'Product' };
    const { service, tx, prisma } = serviceWithRecord({ payloadHash: payloadHashOf(payload), response: storedResponse, expiresAt: new Date() });
    tx.$executeRaw.mockRejectedValue(rawFailure('40001'));
    await expect(service.run({ actorId: 'actor-1', scope: 'catalog.product.create', key: 'raw-conflict-test', payload, execute: vi.fn() })).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
    expect(tx.catalogIdempotencyRecord.create).not.toHaveBeenCalled();
  });

  it.each(['42601', '42501', '23505', '08006'])('does not retry unrelated raw SQLSTATE %s', async sqlState => {
    const payload = { name: 'Product' };
    const { service, tx, prisma } = serviceWithRecord({ payloadHash: payloadHashOf(payload), response: storedResponse, expiresAt: new Date() });
    const error = rawFailure(sqlState);
    tx.$executeRaw.mockRejectedValue(error);
    await expect(service.run({ actorId: 'actor-1', scope: 'catalog.product.create', key: 'raw-conflict-test', payload, execute: vi.fn() })).rejects.toBe(error);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
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
