import { describe, expect, it, vi } from 'vitest';
import type { AdminPaymentRefundService } from '../payments/admin-payment-refund.service';
import type { AuditLogService } from '../audit/audit-log.service';
import type { InventoryService } from '../inventory/inventory.service';
import type { PrismaService } from '../../database/prisma.service';
import { RETURNS_DEFAULT_ENABLED, RETURNS_FLAG, ReturnsService } from './returns.service';

const updatedAt = new Date('2026-11-01T08:00:00.000Z');
const holiday = { id: 'h1', dateKey: '2026-11-10', label: 'تعطیل', actorId: 'staff-1', createdAt: updatedAt };

function harness(flag: { enabled: boolean; version: number; updatedAt: Date } | null = null) {
  const db = {
    storefrontFeatureFlag: {
      findUnique: vi.fn(async () => flag),
      update: vi.fn(async ({ data }: { data: { enabled: boolean; version: number } }) => ({ ...data, updatedAt })),
      create: vi.fn(async ({ data }: { data: { enabled: boolean; version: number } }) => ({ ...data, updatedAt })),
    },
    returnHoliday: {
      findMany: vi.fn(async () => [holiday]),
      findUnique: vi.fn(async () => null as typeof holiday | null),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => holiday),
      delete: vi.fn(async () => holiday),
    },
    order: { findUnique: vi.fn(async () => null) },
    orderReturn: { findUnique: vi.fn(async () => null), count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    $executeRaw: vi.fn(async () => 1),
  };
  const prisma = { ...db, $transaction: vi.fn(async (run: (tx: typeof db) => unknown) => run(db)) };
  const audit = { record: vi.fn(async () => undefined) };
  const service = new ReturnsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLogService,
    {} as InventoryService,
    {} as AdminPaymentRefundService,
  );
  return { service, db, audit };
}

describe('ReturnsService settings and holidays', () => {
  it('is off when the flag was never saved, publicly as well as for staff', async () => {
    const { service } = harness(null);
    expect(RETURNS_DEFAULT_ENABLED).toBe(false);
    await expect(service.readSettings()).resolves.toEqual({ data: { enabled: false, version: 0, updatedAt: null } });
    await expect(service.readPublicConfig()).resolves.toEqual({ data: { enabled: false } });
  });

  it('exposes only the enabled state on the public config', async () => {
    const { service } = harness({ enabled: true, version: 4, updatedAt });
    await expect(service.readPublicConfig()).resolves.toEqual({ data: { enabled: true } });
  });

  it.each([
    [{ expectedVersion: -1, enabled: true }],
    [{ expectedVersion: 1.5, enabled: true }],
    [{ expectedVersion: 0, enabled: 'yes' }],
    [null],
  ])('rejects a malformed switch update %j without touching the database', async (input) => {
    const { service, db } = harness(null);
    await expect(service.updateSettings('staff-1', 'req-1', input as never)).rejects.toMatchObject({ response: { code: 'RETURN_INPUT_INVALID' } });
    expect(db.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses a stale version and writes nothing', async () => {
    const { service, db, audit } = harness({ enabled: false, version: 2, updatedAt });
    await expect(service.updateSettings('staff-1', 'req-1', { expectedVersion: 1, enabled: true })).rejects.toMatchObject({ response: { code: 'RETURN_SETTINGS_STALE' } });
    expect(db.storefrontFeatureFlag.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('creates the flag at version 1 on the first save and audits before and after', async () => {
    const { service, db, audit } = harness(null);
    const result = await service.updateSettings('staff-1', 'req-1', { expectedVersion: 0, enabled: true });
    expect(db.storefrontFeatureFlag.create).toHaveBeenCalledWith({ data: { key: RETURNS_FLAG, enabled: true, version: 1 } });
    expect(result.data).toMatchObject({ enabled: true, version: 1 });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'returns.settings.updated', actorId: 'staff-1', requestId: 'req-1', before: expect.objectContaining({ enabled: false }), after: expect.objectContaining({ enabled: true }) }),
      expect.anything(),
    );
  });

  it('advances the version when an existing flag is switched off', async () => {
    const { service, db } = harness({ enabled: true, version: 3, updatedAt });
    const result = await service.updateSettings('staff-1', 'req-1', { expectedVersion: 3, enabled: false });
    expect(db.storefrontFeatureFlag.update).toHaveBeenCalledWith({ where: { key: RETURNS_FLAG }, data: { enabled: false, version: 4 } });
    expect(result.data).toMatchObject({ enabled: false, version: 4 });
  });

  it('lists holidays in contract form', async () => {
    const { service } = harness();
    await expect(service.listHolidays()).resolves.toEqual({ data: { items: [{ id: 'h1', dateKey: '2026-11-10', label: 'تعطیل', createdAt: updatedAt.toISOString() }] } });
  });

  it('rejects an impossible calendar date', async () => {
    const { service, db } = harness();
    await expect(service.addHoliday({ dateKey: '2026-02-31', label: 'x' }, 'staff-1', 'req-1')).rejects.toMatchObject({ response: { code: 'RETURN_INPUT_INVALID' } });
    expect(db.returnHoliday.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate holiday', async () => {
    const { service, db } = harness();
    db.returnHoliday.findUnique.mockResolvedValue(holiday);
    await expect(service.addHoliday({ dateKey: '2026-11-10', label: 'x' }, 'staff-1', 'req-1')).rejects.toMatchObject({ response: { code: 'RETURN_HOLIDAY_EXISTS' } });
    expect(db.returnHoliday.create).not.toHaveBeenCalled();
  });

  it('stops at the holiday limit', async () => {
    const { service, db } = harness();
    db.returnHoliday.count.mockResolvedValue(2000);
    await expect(service.addHoliday({ dateKey: '2026-11-10', label: 'x' }, 'staff-1', 'req-1')).rejects.toMatchObject({ response: { code: 'RETURN_HOLIDAY_EXISTS' } });
  });

  it('adds a holiday and audits it', async () => {
    const { service, db, audit } = harness();
    await expect(service.addHoliday({ dateKey: '2026-11-10', label: 'تعطیل' }, 'staff-1', 'req-1')).resolves.toMatchObject({ data: { id: 'h1', dateKey: '2026-11-10' } });
    expect(db.returnHoliday.create).toHaveBeenCalledWith({ data: { dateKey: '2026-11-10', label: 'تعطیل', actorId: 'staff-1' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'returns.holiday.added' }), expect.anything());
  });

  it('reports a missing holiday on removal and deletes nothing', async () => {
    const { service, db } = harness();
    await expect(service.removeHoliday('missing', 'staff-1', 'req-1')).rejects.toMatchObject({ response: { code: 'RETURN_NOT_FOUND' } });
    expect(db.returnHoliday.delete).not.toHaveBeenCalled();
  });

  it('removes a holiday and audits what it was', async () => {
    const { service, db, audit } = harness();
    db.returnHoliday.findUnique.mockResolvedValue(holiday);
    await expect(service.removeHoliday('h1', 'staff-1', 'req-1')).resolves.toEqual({ data: { id: 'h1' } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'returns.holiday.removed', before: { dateKey: '2026-11-10', label: 'تعطیل' } }), expect.anything());
  });

  it('reports an unknown order on eligibility', async () => {
    const { service } = harness();
    await expect(service.eligibility('missing')).rejects.toMatchObject({ response: { code: 'RETURN_NOT_FOUND' } });
  });

  it('paginates an empty list with at least one page', async () => {
    const { service } = harness();
    await expect(service.list({ page: 1, perPage: 20 })).resolves.toEqual({ data: { items: [], meta: { page: 1, perPage: 20, total: 0, pages: 1 } } });
  });
});
