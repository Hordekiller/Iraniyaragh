import { describe, expect, it } from 'vitest';
import { ORDERS_READ, canReadOrders } from '../orders-permissions';

describe('orders-permissions', () => {
  it('grants access only with the permission required by the read API', () => {
    expect(canReadOrders(null)).toBe(false);
    expect(canReadOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [] })).toBe(false);
    expect(
      canReadOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [ORDERS_READ] }),
    ).toBe(true);
  });
});
