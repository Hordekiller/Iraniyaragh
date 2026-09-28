import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { SuppliersController } from './suppliers.controller';
import { SupplierCreateDto, SupplierListQueryDto, SupplierUpdateDto } from './suppliers.dto';

describe('Suppliers HTTP boundary', () => {
  it('requires staff MFA and least-privilege permissions on every operation', () => {
    const prototype = SuppliersController.prototype;
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, SuppliersController)).toBe('STAFF_MFA');
    for (const method of ['list', 'get', 'history'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('suppliers.read');
    }
    for (const method of ['create', 'update'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('suppliers.manage');
    }
  });

  it('validates and normalizes codes, contact data and pagination', async () => {
    const valid = plainToInstance(SupplierCreateDto, { code: ' sup-a1 ', name: ' Supplier ', email: ' test@example.com ' });
    expect(await validate(valid)).toEqual([]);
    expect(valid).toMatchObject({ code: 'SUP-A1', name: 'Supplier', email: 'test@example.com' });
    expect(await validate(plainToInstance(SupplierCreateDto, { code: 'bad code', name: '' }))).not.toEqual([]);
    expect(await validate(plainToInstance(SupplierUpdateDto, { expectedVersion: -1 }))).not.toEqual([]);
    expect(await validate(plainToInstance(SupplierUpdateDto, { expectedVersion: 0, email: 'invalid' }))).not.toEqual([]);
    expect(await validate(plainToInstance(SupplierUpdateDto, { expectedVersion: 0, name: null, isActive: null }))).not.toEqual([]);
    const query = plainToInstance(SupplierListQueryDto, { isActive: 'false', offset: '2', limit: '20' });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({ isActive: false, offset: 2, limit: 20 });
  });

  it('passes identity and retry key to the service', async () => {
    const service = { create: vi.fn().mockResolvedValue({ id: 'supplier-1' }), update: vi.fn().mockResolvedValue({ id: 'supplier-1' }) };
    const controller = new SuppliersController(service as never);
    const principal = { userId: 'staff-1' } as never;
    await controller.create(principal, 'retry-key-123', { code: 'SUP-A1', name: 'Supplier' });
    expect(service.create).toHaveBeenCalledWith({ code: 'SUP-A1', name: 'Supplier' }, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-123' }));
    await controller.update(principal, 'retry-key-456', 'supplier-1', { expectedVersion: 0, name: 'Updated' });
    expect(service.update).toHaveBeenCalledWith('supplier-1', { expectedVersion: 0, name: 'Updated' }, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-456' }));
  });
});
