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
