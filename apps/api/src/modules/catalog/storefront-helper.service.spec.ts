import { describe, expect, it, vi } from 'vitest';
import { StorefrontHelperService, validateHelperUpdate } from './storefront-helper.service';

function fixture(row: { enabled: boolean; version: number; updatedAt: Date } | null) {
  const flag = {
    findUnique: vi.fn(async () => row),
    create: vi.fn(async ({ data }: { data: { enabled: boolean; version: number } }) => ({ ...data, updatedAt: new Date('2026-11-04T00:00:00Z') })),
    update: vi.fn(async ({ data }: { data: { enabled: boolean; version: number } }) => ({ ...data, updatedAt: new Date('2026-11-04T01:00:00Z') })),
  };
  const tx = { $executeRaw: vi.fn(), storefrontFeatureFlag: flag };
  const prisma = { storefrontFeatureFlag: flag, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  const audit = { record: vi.fn() };
  return { service: new StorefrontHelperService(prisma as never, audit as never), flag, audit };
}

describe('storefront customer helper switch', () => {
  it('defaults to enabled until an admin saves, and reports version 0', async () => {
    const { service } = fixture(null);
    expect(await service.readPublic()).toEqual({ enabled: true });
    expect(await service.readAdmin()).toEqual({ enabled: true, version: 0, updatedAt: null });
  });

  it('exposes only the boolean publicly', async () => {
    const { service } = fixture({ enabled: false, version: 3, updatedAt: new Date() });
    expect(await service.readPublic()).toEqual({ enabled: false });
  });

  it('creates the first row, bumps the version and writes an audit record', async () => {
    const { service, flag, audit } = fixture(null);
    const result = await service.update('staff-1', 'req-1', { expectedVersion: 0, enabled: false });
    expect(flag.create).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ enabled: false, version: 1 });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ actorId: 'staff-1', action: 'storefront.customer_helper.updated', before: expect.objectContaining({ enabled: true }), after: expect.objectContaining({ enabled: false }) }), expect.anything());
  });

  it('updates an existing row and rejects a stale version without writing', async () => {
    const { service, flag, audit } = fixture({ enabled: false, version: 2, updatedAt: new Date() });
    await expect(service.update('s', 'r', { expectedVersion: 1, enabled: true })).rejects.toMatchObject({ response: { code: 'STALE_VERSION' } });
    expect(flag.update).not.toHaveBeenCalled(); expect(audit.record).not.toHaveBeenCalled()
    expect(await service.update('s', 'r', { expectedVersion: 2, enabled: true })).toMatchObject({ enabled: true, version: 3 });
  });

  it('rejects malformed input', () => {
    expect(() => validateHelperUpdate({ expectedVersion: -1, enabled: true })).toThrow();
    expect(() => validateHelperUpdate({ expectedVersion: 0, enabled: 'yes' as unknown as boolean })).toThrow();
  });
});

import { StorefrontHelperController } from './storefront-helper.controller';
describe('storefront helper controller', () => {
  it('delegates the public read, admin read and update', async () => {
    const service = { readPublic: vi.fn(async () => ({ enabled: true })), readAdmin: vi.fn(async () => ({ enabled: true, version: 0, updatedAt: null })), update: vi.fn(async () => ({ enabled: false, version: 1, updatedAt: null })) };
    const controller = new StorefrontHelperController(service as never);
    expect(await controller.publicConfig()).toEqual({ data: { enabled: true } });
    expect(await controller.adminConfig()).toEqual({ data: { config: { enabled: true, version: 0, updatedAt: null } } });
    await controller.update({ userId: 'u' } as never, { expectedVersion: 0, enabled: false });
    expect(service.update).toHaveBeenCalledWith('u', expect.anything(), { expectedVersion: 0, enabled: false });
  });
});
