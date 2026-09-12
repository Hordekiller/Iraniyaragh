import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

const variant = {
  id: 'variant-1', sku: 'SKU-1', barcode: '123', title: 'Variant', costPrice: 100n, salePrice: 200n,
  weightGrams: 10, lengthCm: null, widthCm: null, heightCm: null, status: 'ACTIVE', isActive: true, version: 3,
  createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function setup() {
  const tx = {
    attributeDefinition: {
      create: vi.fn().mockResolvedValue({ id: 'attribute-1', code: 'color', name: 'Color', description: null, status: 'ACTIVE', version: 1, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), options: [], _count: { options: 0 } }),
      findUnique: vi.fn().mockResolvedValue({ id: 'attribute-1', code: 'color', name: 'Color', description: null, status: 'ACTIVE', version: 1, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), options: [], _count: { options: 0 } }),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 'attribute-1', code: 'color', name: 'Colour', description: null, status: 'ACTIVE', version: 2, createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z'), options: [], _count: { options: 0 } }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    attributeOption: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      updateMany: vi.fn(),
    },
    productVariant: {
      findUnique: vi.fn().mockResolvedValue(variant),
      findUniqueOrThrow: vi.fn().mockResolvedValue({ ...variant, version: 4 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    variantPriceRecord: {
      create: vi.fn().mockResolvedValue({ id: 'price-1', variantId: variant.id, costPrice: 110n, salePrice: 220n, effectiveAt: new Date('2026-01-02T00:00:00Z'), source: 'ADMIN', actorUserId: 'actor-1', reason: 'Increase', requestId: 'req-1', createdAt: new Date('2026-01-02T00:00:00Z') }),
    },
  };
  const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
  const audit = { record: vi.fn() };
  const idempotency = { run: vi.fn(async ({ execute }: { execute: (client: typeof tx) => unknown }) => { const result = await execute(tx) as { response?: unknown }; return result.response ?? result; }) };
  return { service: new CatalogService(prisma as never, audit as never, idempotency as never), tx, audit };
}

describe('CatalogService P2 variant mutations', () => {
  it('rejects SKU changes before touching persistence', async () => {
    const { service } = setup();
    await expect(service.updateVariant('actor-1', 'variant-1', { sku: 'NEW', expectedVersion: 3 })).rejects.toMatchObject({ response: { code: 'SKU_CHANGE_NOT_ALLOWED' } });
  });

  it('normalizes blank barcodes to null and performs a versioned update', async () => {
    const { service, tx } = setup();
    const result = await service.updateVariant('actor-1', 'variant-1', { barcode: '   ', expectedVersion: 3 });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'variant-1', version: 3 }, data: expect.objectContaining({ barcode: null }) }));
    expect(result.data.variant.version).toBe(4);
  });

  it('rejects a stale variant update without writing', async () => {
    const { service, tx } = setup();
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateVariant('actor-1', 'variant-1', { title: 'New', expectedVersion: 2 })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
  });

  it('updates status and legacy isActive together', async () => {
    const { service, tx } = setup();
    await service.updateVariantStatus('actor-1', 'status-key', 'variant-1', { status: 'INACTIVE', expectedVersion: 3 });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({ where: { id: 'variant-1', version: 3 }, data: { status: 'INACTIVE', isActive: false, version: { increment: 1 } } });
  });

  it('records an accepted price mutation in the same transaction', async () => {
    const { service, tx, audit } = setup();
    const result = await service.updateVariantPrice('actor-1', 'variant-1', { costPrice: { amount: '110', currency: 'IRR' }, salePrice: { amount: '220', currency: 'IRR' }, reason: 'Increase', expectedVersion: 3 });
    expect(tx.variantPriceRecord.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ variantId: 'variant-1', source: 'ADMIN', actorUserId: 'actor-1', reason: 'Increase' }) }));
    expect(result.data.record.costPrice.amount).toBe('110');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('maps a stale price mutation to STALE_VERSION', async () => {
    const { service, tx } = setup();
    tx.productVariant.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateVariantPrice('actor-1', 'variant-1', { costPrice: { amount: '110', currency: 'IRR' }, salePrice: { amount: '220', currency: 'IRR' }, expectedVersion: 2 })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.variantPriceRecord.create).not.toHaveBeenCalled();
  });

  it('creates an attribute with normalized options inside the idempotent transaction', async () => {
    const { service, tx, audit } = setup();
    const result = await service.createAttribute('actor-1', 'attribute-key', { code: ' color ', name: ' Colour ', options: [{ code: ' red ', label: ' Red ' }] });
    expect(tx.attributeDefinition.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ code: 'color', name: 'Colour', options: { create: [{ code: 'red', label: 'Red', status: 'ACTIVE' }] } }) }));
    expect(result.data.attribute.code).toBe('color');
    expect(audit.record).toHaveBeenCalledTimes(1);
  });

  it('rejects stale attribute edits before returning the updated projection', async () => {
    const { service, tx } = setup();
    tx.attributeDefinition.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateAttribute('actor-1', 'attribute-1', { name: 'New', expectedVersion: 0 })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
  });
});
