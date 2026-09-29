import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { CustomersController } from './customers.controller';
import {
  CustomerAddressesDto,
  CustomerCreateDto,
  CustomerListQueryDto,
  CustomerNoteDto,
  CustomerUpdateDto,
} from './customers.dto';

describe('Customers HTTP boundary', () => {
  it('requires staff MFA and least-privilege permissions on every operation', () => {
    const prototype = CustomersController.prototype;
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, CustomersController)).toBe('STAFF_MFA');
    for (const method of ['list', 'get', 'history'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('customers.read');
    }
    // Read and write are separate grants: a read-only directory operator must
    // not be able to create, edit, deactivate, or write notes.
    for (const method of ['create', 'update', 'replaceAddresses', 'addNote'] as const) {
      expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype[method])).toBe('customers.manage');
    }
  });

  it('rejects an unknown sort field, status and page', async () => {
    expect(await validate(plainToInstance(CustomerListQueryDto, { sortBy: 'balance' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerListQueryDto, { sortDir: 'sideways' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerListQueryDto, { status: 'BANNED' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerListQueryDto, { page: 0 }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerListQueryDto, { perPage: 500 }))).not.toEqual([]);
  });

  it('parses pagination, booleans and sort direction from query strings', async () => {
    const query = plainToInstance(CustomerListQueryDto, { page: '2', perPage: '10', hasUserAccount: 'false', sortDir: 'asc' });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({ page: 2, perPage: 10, hasUserAccount: false, sortDir: 'asc' });
  });

  it('normalizes Persian digits and separators in the mobile on create', async () => {
    const dto = plainToInstance(CustomerCreateDto, { mobile: '۰۹۱۲ ۱۲۳ ۴۵۶۷', firstName: '  زهرا  ', lastName: '   ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.mobile).toBe('09121234567');
    expect(dto.firstName).toBe('زهرا');
    expect(dto.lastName).toBeNull();
  });

  it('rejects a create with no mobile and a truncated mobile', async () => {
    expect(await validate(plainToInstance(CustomerCreateDto, {}))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerCreateDto, { mobile: '0912' }))).not.toEqual([]);
  });

  it('requires expectedVersion on every mutating command', async () => {
    expect(await validate(plainToInstance(CustomerUpdateDto, { firstName: 'x' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerUpdateDto, { expectedVersion: -1 }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerAddressesDto, { addresses: [] }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerNoteDto, { expectedVersion: 0, visibility: 'INTERNAL' }))).not.toEqual([]);
  });

  it('rejects a note visibility outside the two allowed values', async () => {
    expect(await validate(plainToInstance(CustomerNoteDto, { expectedVersion: 0, visibility: 'PUBLIC', body: 'x' }))).not.toEqual([]);
    expect(await validate(plainToInstance(CustomerNoteDto, { expectedVersion: 0, visibility: 'CUSTOMER_VISIBLE', body: '   ' }))).not.toEqual([]);
  });

  it('validates nested address entries and caps the set size', async () => {
    const valid = plainToInstance(CustomerAddressesDto, {
      expectedVersion: 0,
      addresses: [{ label: ' خانه ', receiverName: ' زهرا ', mobile: '0912-123-4567', provinceCode: 'thr', city: ' تهران ', addressLine: ' خیابان ولیعصر ', isDefault: 'true' }],
    });
    expect(await validate(valid)).toEqual([]);
    expect(valid.addresses[0]).toMatchObject({ label: 'خانه', mobile: '09121234567', provinceCode: 'THR', city: 'تهران', isDefault: true });

    const missingField = plainToInstance(CustomerAddressesDto, { expectedVersion: 0, addresses: [{ label: 'خانه' }] });
    expect(await validate(missingField)).not.toEqual([]);

    const tooMany = plainToInstance(CustomerAddressesDto, {
      expectedVersion: 0,
      addresses: Array.from({ length: 21 }, () => ({ label: 'a', receiverName: 'b', mobile: '09121234567', provinceCode: 'THR', city: 'c', addressLine: 'd' })),
    });
    expect(await validate(tooMany)).not.toEqual([]);
  });

  it('passes identity and retry key to the service for every command', async () => {
    const service = {
      create: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      update: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      replaceAddresses: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      addNote: vi.fn().mockResolvedValue({ id: 'cus_1' }),
    };
    const controller = new CustomersController(service as never);
    const principal = { userId: 'staff-1' } as never;

    await controller.create(principal, 'retry-key-123', { mobile: '09121234567' });
    expect(service.create).toHaveBeenCalledWith({ mobile: '09121234567' }, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-123' }));

    await controller.update(principal, 'retry-key-456', 'cus_1', { expectedVersion: 0, firstName: 'x' });
    expect(service.update).toHaveBeenCalledWith('cus_1', { expectedVersion: 0, firstName: 'x' }, expect.objectContaining({ actorId: 'staff-1', idempotencyKey: 'retry-key-456' }));

    await controller.replaceAddresses(principal, 'retry-key-789', 'cus_1', { expectedVersion: 0, addresses: [] });
    expect(service.replaceAddresses).toHaveBeenCalledWith('cus_1', { expectedVersion: 0, addresses: [] }, expect.objectContaining({ idempotencyKey: 'retry-key-789' }));

    await controller.addNote(principal, 'retry-key-abc', 'cus_1', { expectedVersion: 0, visibility: 'INTERNAL', body: 'note' });
    expect(service.addNote).toHaveBeenCalledWith('cus_1', { expectedVersion: 0, visibility: 'INTERNAL', body: 'note' }, expect.objectContaining({ idempotencyKey: 'retry-key-abc' }));
  });

  it('wraps list and detail in the standard success envelope with page meta', async () => {
    const service = {
      list: vi.fn().mockResolvedValue({ items: [{ id: 'cus_1' }], total: 45 }),
      get: vi.fn().mockResolvedValue({ id: 'cus_1' }),
      history: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const controller = new CustomersController(service as never);

    const list = await controller.list({ page: 2, perPage: 20 } as never);
    expect(list.data.meta).toEqual({ page: 2, perPage: 20, total: 45, pages: 3 });

    const detail = await controller.get('cus_1');
    expect(detail.data.customer).toEqual({ id: 'cus_1' });
  });
});
