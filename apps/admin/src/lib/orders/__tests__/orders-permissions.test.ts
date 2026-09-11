import { describe, expect, it } from 'vitest';
import {
  ORDERS_READ,
  ORDERS_WRITE,
  canReadOrders,
  canWriteOrders,
} from '../orders-permissions';

describe('orders-permissions', () => {
  it('grants read access only with orders.read', () => {
    expect(canReadOrders(null)).toBe(false);
    expect(canReadOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [] })).toBe(false);
    expect(
      canReadOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [ORDERS_READ] }),
    ).toBe(true);
  });

  it('grants write access only with orders.write', () => {
    expect(canWriteOrders(null)).toBe(false);
    expect(
      canWriteOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [ORDERS_READ] }),
    ).toBe(false);
    expect(
      canWriteOrders({ userId: 'u', sessionId: 's', authenticationLevel: 'x', permissions: [ORDERS_WRITE] }),
    ).toBe(true);
  });
});