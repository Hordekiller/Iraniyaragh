import { describe, expect, it, vi } from 'vitest';
import { StorefrontContactsController } from './storefront-contacts.controller';
import { StorefrontContactsService, validateContactsUpdate } from './storefront-contacts.service';

const link = { id: 'instagram', channel: 'instagram' as const, label: 'اینستاگرام', value: 'https://www.instagram.com/iraniyaragh/' };

describe('storefront contacts', () => {
  it('accepts secure links and normalizes Persian phone digits', () => {
    const result = validateContactsUpdate({ expectedVersion: 0, links: [link, { id: 'phone', channel: 'phone', label: 'تلفن فروشگاه', value: '۰۲۱ ۱۲۳۴۵۶۷۸' }] });
    expect(result.links[1]?.value).toBe('02112345678');
  });
  it.each(['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com'])('rejects unsafe address %s', value => {
    expect(() => validateContactsUpdate({ expectedVersion: 0, links: [{ ...link, value }] })).toThrow();
  });
  it('rejects duplicate ids, invalid phone and too many entries', () => {
    expect(() => validateContactsUpdate({ expectedVersion: 0, links: [link, link] })).toThrow();
    expect(() => validateContactsUpdate({ expectedVersion: 0, links: [{ ...link, channel: 'phone', value: '123' }] })).toThrow();
    expect(() => validateContactsUpdate({ expectedVersion: 0, links: Array(13).fill(link) })).toThrow();
  });
  it('reads, version-checks, updates and audits', async () => {
    const table = { findUnique: vi.fn(async () => null), upsert: vi.fn(async ({ create }: { create: { links: unknown; version: number } }) => ({ ...create, updatedAt: new Date() })) };
    const tx = { $executeRaw: vi.fn(), storefrontContactConfig: table };
    const prisma = { storefrontContactConfig: table, $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
    const audit = { record: vi.fn() };
    const service = new StorefrontContactsService(prisma as never, audit as never);
    expect(await service.readPublic()).toEqual({ links: [] });
    expect(await service.update('staff', 'req', { expectedVersion: 0, links: [link] })).toMatchObject({ version: 1, links: [link] });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'storefront.contacts.updated' }), tx);
    await expect(service.update('staff', 'req', { expectedVersion: 1, links: [] })).rejects.toMatchObject({ status: 409 });
  });
  it('keeps admin write behind the controller and exposes only links publicly', async () => {
    const service = { readPublic: vi.fn(async () => ({ links: [link] })), readAdmin: vi.fn(async () => ({ version: 0, links: [link], updatedAt: null })), update: vi.fn(async () => ({ version: 1, links: [], updatedAt: null })) };
    const controller = new StorefrontContactsController(service as never);
    expect(await controller.publicConfig()).toEqual({ data: { links: [link] } });
    await controller.update({ userId: 'staff' } as never, { expectedVersion: 0, links: [] });
    expect(service.update).toHaveBeenCalledWith('staff', expect.anything(), { expectedVersion: 0, links: [] });
  });
});
