import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { REQUIRE_AUTH_LEVEL, REQUIRE_PERMISSION } from '../auth/auth.guard';
import { AuditController } from './audit.controller';
import { AuditLogListQueryDto } from './audit.dto';

describe('Audit HTTP boundary', () => {
  it('requires staff MFA and audit.read on every operation', () => {
    const prototype = AuditController.prototype;
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, AuditController)).toBe('STAFF_MFA');
    expect(Reflect.getMetadata(REQUIRE_PERMISSION, prototype.list)).toBe('audit.read');
  });

  it('validates pagination and filter inputs', async () => {
    expect(await validate(plainToInstance(AuditLogListQueryDto, { offset: '5', limit: '20', action: 'STOCKTAKE.COMPLETE' }))).toEqual([]);
    expect(await validate(plainToInstance(AuditLogListQueryDto, { limit: '0' }))).not.toEqual([]);
    expect(await validate(plainToInstance(AuditLogListQueryDto, { limit: '101' }))).not.toEqual([]);
    expect(await validate(plainToInstance(AuditLogListQueryDto, { offset: '-1' }))).not.toEqual([]);
    expect(await validate(plainToInstance(AuditLogListQueryDto, { createdFrom: 'not-a-date' }))).not.toEqual([]);
    const query = plainToInstance(AuditLogListQueryDto, { createdFrom: '2026-01-01T00:00:00.000Z', createdToExclusive: '2026-02-01T00:00:00.000Z' });
    expect(await validate(query)).toEqual([]);
  });

  it('passes filters to the service', async () => {
    const service = { list: vi.fn().mockResolvedValue({ items: [], count: 0 }) };
    const controller = new AuditController(service as never);
    await controller.list({ offset: 0, limit: 50, entityType: 'order' });
    expect(service.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 0, limit: 50, entityType: 'order' }));
  });
});