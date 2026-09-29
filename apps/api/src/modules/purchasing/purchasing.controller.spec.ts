import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRE_AUTH_LEVEL, REQUIRE_FRESH_AUTH, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { PurchasingController } from './purchasing.controller';
import { PurchaseOrderActionDto, PurchaseOrderCreateDto, PurchaseOrderItemDto, PurchaseOrderListQueryDto, PurchaseOrderOptionsQueryDto, PurchaseOrderUpdateDto, PurchaseReceiptCreateDto, PurchaseReceiptLocationQueryDto } from './purchasing.dto';

describe('Purchase Order HTTP boundary', () => {
  it('requires staff MFA and separates read, manage and fresh-MFA approval', () => {
    const prototype = PurchasingController.prototype;
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, PurchasingController)).toBe('STAFF_MFA');
    for (const method of ['list', 'options', 'get', 'history', 'receipts', 'receiptLocations'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('purchasing.read');
    }
    for (const method of ['create', 'update', 'cancel'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('purchasing.manage');
    }
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.approve)).toBe('purchasing.approve');
    expect(Reflect.getMetadata(REQUIRE_FRESH_AUTH, prototype.approve)).toBe(true);
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.receive)).toBe('purchasing.receive');
  });

  it('rejects malformed lines, money and stale-version shapes', async () => {
    const valid = plainToInstance(PurchaseOrderCreateDto, { supplierId: 'supplier-1', warehouseId: 'warehouse-1',
      items: [{ variantId: 'variant-1', orderedQty: 2, unitCost: '120000' }] });
    expect(await validate(valid)).toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderItemDto, { variantId: 'sku', orderedQty: 0, unitCost: '1.25' }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderCreateDto, { supplierId: 'supplier-1', warehouseId: 'warehouse-1', items: [] }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderUpdateDto, { expectedVersion: -1 }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderActionDto, {}))).not.toEqual([]);
    const query = plainToInstance(PurchaseOrderListQueryDto, { offset: '2', limit: '20', status: 'APPROVED' });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({ offset: 2, limit: 20, status: 'APPROVED' });
    expect(await validate(plainToInstance(PurchaseOrderOptionsQueryDto, { kind: 'variant', limit: '50', search: 'SKU' }))).toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderOptionsQueryDto, { kind: 'unknown' }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseOrderOptionsQueryDto, { kind: 'supplier', limit: '1000' }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseReceiptCreateDto, { expectedVersion: 2, externalReference: 'DEL-1',
      lines: [{ variantId: 'variant-1', locationId: 'loc-1', quantity: 1 }] }))).toEqual([]);
    expect(await validate(plainToInstance(PurchaseReceiptCreateDto, { expectedVersion: -1, externalReference: '',
      lines: [{ variantId: 'variant-1', locationId: 'loc-1', quantity: 0 }] }))).not.toEqual([]);
    expect(await validate(plainToInstance(PurchaseReceiptLocationQueryDto, { search: 'A', limit: '50' }))).toEqual([]);
    expect(await validate(plainToInstance(PurchaseReceiptLocationQueryDto, { limit: '51' }))).not.toEqual([]);
  });

  it('passes actor and retry key to the service', async () => {
    const service = { create: vi.fn().mockResolvedValue({ id: 'po-1' }), approve: vi.fn().mockResolvedValue({ id: 'po-1' }) };
    const controller = new PurchasingController(service as never);
    const principal = { userId: 'staff-1' } as never;
    const input = { supplierId: 'supplier-1', warehouseId: 'warehouse-1', items: [{ variantId: 'variant-1', orderedQty: 1, unitCost: '100' }] };
    await controller.create(principal, 'retry-key-123', input);
    expect(service.create).toHaveBeenCalledWith(input, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-123' }));
    await controller.approve(principal, 'retry-key-456', 'po-1', { expectedVersion: 0 });
    expect(service.approve).toHaveBeenCalledWith('po-1', { expectedVersion: 0 }, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-456' }));
  });
});
