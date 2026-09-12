import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from './catalog.service';

const dates = { createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-01T00:00:00Z') };

function generationService(options = [
  { id: 'red-id', code: 'red', label: 'Red' },
  { id: 'blue-id', code: 'blue', label: 'Blue' },
]) {
  const prisma = {
    product: {
      findUnique: vi.fn().mockResolvedValue({
        slug: 'shirt',
        attributes: [{ attributeId: 'color-id', isVariantAxis: true, attribute: { id: 'color-id', code: 'color', name: 'Color', options: options.map(option => ({ ...option, status: 'ACTIVE' })) } }],
      }),
    },
  };
  return { service: new CatalogService(prisma as never, { record: vi.fn() } as never, { run: vi.fn() } as never), prisma };
}

describe('CatalogService product attribute configuration and generation', () => {
  it('previews a deterministic Cartesian product without writing', async () => {
    const { service, prisma } = generationService();
    const result = await service.previewVariantGeneration('product-1', { optionSelection: { color: ['blue', 'red'] } });

    expect(result.data.total).toBe(2);
    expect(result.data.combinations.map(combination => combination.combinationSignature)).toHaveLength(2);
    expect(prisma.product.findUnique).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown options and combinations above the hard cap', async () => {
    const { service } = generationService();
    await expect(service.previewVariantGeneration('product-1', { optionSelection: { color: ['missing'] } })).rejects.toBeInstanceOf(UnprocessableEntityException);

    const many = Array.from({ length: 2_001 }, (_, index) => ({ id: `option-${index}`, code: `option-${index}`, label: `Option ${index}` }));
    const capped = generationService(many).service;
    await expect(capped.previewVariantGeneration('product-1', { optionSelection: { color: many.map(option => option.code) } })).rejects.toMatchObject({ response: { code: 'COMBINATION_LIMIT_EXCEEDED' } });
  });

  it('blocks removing an axis used by an active variant', async () => {
    const current = {
      version: 3,
      attributes: [{ attributeId: 'color-id', isVariantAxis: true, isRequired: false, attribute: { code: 'color', name: 'Color' } }],
      variants: [],
      ...dates,
    };
    const tx = {
      product: { findUnique: vi.fn().mockResolvedValue(current), updateMany: vi.fn(), findUniqueOrThrow: vi.fn() },
      attributeDefinition: { findMany: vi.fn().mockResolvedValue([{ id: 'color-id', code: 'color' }]) },
      productVariantAttributeValue: { count: vi.fn().mockResolvedValue(1) },
      productAttributeConfiguration: { deleteMany: vi.fn(), createMany: vi.fn() },
    };
    const prisma = { $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const service = new CatalogService(prisma as never, { record: vi.fn() } as never, { run: vi.fn() } as never);

    await expect(service.configureProductAttributes('actor-1', 'product-1', { expectedVersion: 3, configurations: [] })).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productAttributeConfiguration.deleteMany).not.toHaveBeenCalled();
  });

  it('persists generated variants atomically with server-owned SKUs', async () => {
    const tx = {
      product: { findUnique: vi.fn().mockResolvedValue({ slug: 'shirt', attributes: [{ attribute: { id: 'color-id', code: 'color', name: 'Color', options: [{ id: 'red-id', code: 'red', label: 'Red', status: 'ACTIVE' }] } }] }) },
      productVariant: { create: vi.fn().mockResolvedValue({ id: 'variant-1', sku: 'shirt-red', barcode: null, title: 'Red', costPrice: 100n, salePrice: 200n, weightGrams: null, lengthCm: null, widthCm: null, heightCm: null, status: 'ACTIVE', isActive: true, version: 1, createdAt: dates.createdAt, updatedAt: dates.updatedAt, attributeValues: [{ attribute: { code: 'color', name: 'Color' }, option: { code: 'red', label: 'Red' } }] }) },
    };
    const idempotency = { run: vi.fn(async ({ execute }: { execute: (client: typeof tx) => unknown }) => (await execute(tx) as { response: unknown }).response) };
    const service = new CatalogService({} as never, { record: vi.fn() } as never, idempotency as never);

    const result = await service.generateVariants('actor-1', 'generate-key', 'product-1', { optionSelection: { color: ['red'] }, costPrice: { amount: '100', currency: 'IRR' }, salePrice: { amount: '200', currency: 'IRR' } });
    expect(result.data.variants[0].sku).toBe('shirt-red');
    expect(tx.productVariant.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sku: 'shirt-red', skuKey: 'SHIRT-RED' }) }));
  });
});
