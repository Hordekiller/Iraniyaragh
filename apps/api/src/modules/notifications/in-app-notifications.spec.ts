import { describe, expect, it, vi } from 'vitest';
import { InAppNotificationProjector } from './in-app-notification.projector';
import { InAppNotificationsService } from './in-app-notifications.service';

function tx(order: unknown, staff: { id: string }[] = []) {
  return { order: { findUnique: vi.fn().mockResolvedValue(order) }, user: { findMany: vi.fn().mockResolvedValue(staff) }, inAppNotification: { createMany: vi.fn() } };
}

describe('InAppNotificationProjector', () => {
  it('notifies the owning customer and permitted staff with an idempotent key, without PII', async () => {
    const t = tx({ number: 'A-1', customer: { userId: 'cu' } }, [{ id: 's1' }]);
    await new InAppNotificationProjector().project(t as never, { id: 'ev1', topic: 'ORDER_CREATED' }, 'o1');
    const call = t.inAppNotification.createMany.mock.calls[0]![0];
    expect(call.skipDuplicates).toBe(true);
    expect(call.data.map((r: { userId: string; dedupKey: string }) => [r.userId, r.dedupKey])).toEqual([['cu', 'ev1:CUSTOMER'], ['s1', 'ev1:STAFF']]);
    expect(JSON.stringify(call.data)).not.toMatch(/mobile|address/i);
  });
  it('skips guests, unknown topics and missing orders', async () => {
    const guest = tx({ number: 'A-2', customer: { userId: null } });
    await new InAppNotificationProjector().project(guest as never, { id: 'e', topic: 'SHIPMENT_DELIVERED' }, 'o');
    expect(guest.inAppNotification.createMany).not.toHaveBeenCalled();
    const unknown = tx(null);
    await new InAppNotificationProjector().project(unknown as never, { id: 'e', topic: 'NOPE' }, 'o');
    await new InAppNotificationProjector().project(unknown as never, { id: 'e', topic: 'ORDER_CREATED' }, 'o');
    expect(unknown.inAppNotification.createMany).not.toHaveBeenCalled();
  });
});

describe('InAppNotificationsService authorization', () => {
  it('scopes every mutation to user and audience, hiding other users rows as not found', async () => {
    const prisma = { inAppNotification: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn(), findFirstOrThrow: vi.fn() } };
    const service = new InAppNotificationsService(prisma as never);
    await expect(service.setRead('me', 'CUSTOMER', 'someone-elses', true)).rejects.toMatchObject({ status: 404 });
    expect(prisma.inAppNotification.updateMany.mock.calls[0]![0].where).toEqual({ id: 'someone-elses', userId: 'me', audience: 'CUSTOMER' });
  });
  it('rejects a malformed cursor', async () => {
    const service = new InAppNotificationsService({} as never);
    await expect(service.list('u', 'STAFF', { cursor: 'garbage' })).rejects.toMatchObject({ status: 400 });
  });
});

import { CustomerNotificationsController, StaffNotificationsController } from './in-app-notifications.controller';

const row = (id: string, readAt: Date | null = null) => ({ id, kind: 'K', title: 't', body: 'b', href: '/orders/1', readAt, createdAt: new Date('2026-11-04T08:00:00Z') });

describe('InAppNotificationsService behaviour', () => {
  it('paginates newest first with a cursor and unread count', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => row(`n${i}`));
    const prisma = { inAppNotification: { findMany: vi.fn(async () => rows), count: vi.fn(async () => 5) } };
    const page = await new InAppNotificationsService(prisma as never).list('u', 'CUSTOMER', { unreadOnly: true, cursor: '2026-11-05T00:00:00.000Z|zz' });
    expect(page.items).toHaveLength(20);
    expect(page.nextCursor).toBe('2026-11-04T08:00:00.000Z|n19');
    expect(page.unreadCount).toBe(5);
    expect(prisma.inAppNotification.findMany.mock.calls[0]![0].where).toMatchObject({ userId: 'u', audience: 'CUSTOMER', readAt: null });
  });
  it('toggles read state and marks all read within the audience', async () => {
    const prisma = { inAppNotification: { updateMany: vi.fn(async () => ({ count: 1 })), findFirstOrThrow: vi.fn(async () => row('n1', new Date())), count: vi.fn(async () => 0) } };
    const service = new InAppNotificationsService(prisma as never);
    expect((await service.setRead('u', 'STAFF', 'n1', true)).read).toBe(true);
    expect(await service.markAllRead('u', 'STAFF')).toBe(0);
    expect(prisma.inAppNotification.updateMany.mock.calls[1]![0].where).toEqual({ userId: 'u', audience: 'STAFF', readAt: null });
  });
});

describe('notification controllers', () => {
  const service = { list: vi.fn(async () => ({ items: [], unreadCount: 0, nextCursor: null })), unread: vi.fn(async () => 3), markAllRead: vi.fn(async () => 0), setRead: vi.fn(async () => ({ id: 'n1' })) };
  it.each([[CustomerNotificationsController, 'CUSTOMER'], [StaffNotificationsController, 'STAFF']] as const)('%o scopes to its audience and ignores array-typed query values', async (Controller, audience) => {
    const c = new Controller(service as never);
    const p = { userId: 'u' } as never;
    await c.list(p, ['a', 'b'], 'true');
    expect(service.list).toHaveBeenLastCalledWith('u', audience, { cursor: undefined, unreadOnly: true });
    expect(await c.unreadCount(p)).toEqual({ data: { unreadCount: 3 } });
    await c.readAll(p);
    await c.read(p, 'n1');
    await c.unread(p, 'bad id!');
    expect(service.setRead).toHaveBeenCalledWith('u', audience, 'n1', true);
    expect(service.setRead).toHaveBeenLastCalledWith('u', audience, '__invalid__', false);
  });
});
