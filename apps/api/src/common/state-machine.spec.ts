import { describe, expect, it } from 'vitest';
import {
  FULFILLMENT_TRANSITIONS,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  assertTransition,
  canTransition,
  transitionMachine,
} from './state-machine';

describe('order transition machine', () => {
  it('allows the happy path from draft to paid', () => {
    const path = ['DRAFT', 'PENDING_PAYMENT', 'PAID'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1], ORDER_TRANSITIONS)).toBe(true);
    }
  });

  it('allows cancellation before payment', () => {
    expect(canTransition('PENDING_PAYMENT', 'CANCELLED', ORDER_TRANSITIONS)).toBe(true);
  });

  it.each([
    ['PAID', 'PENDING_PAYMENT'],
    ['CANCELLED', 'PENDING_PAYMENT'],
    ['RETURNED', 'CANCELLED'],
    ['PENDING_PAYMENT', 'PENDING_PAYMENT'],
  ] as const)('rejects illegal order transition %s -> %s', (from, to) => {
    expect(canTransition(from, to, ORDER_TRANSITIONS)).toBe(false);
  });
});

describe('payment transition machine', () => {
  it('allows a successful and refundable payment lifecycle', () => {
    expect(canTransition('PENDING', 'PAID', PAYMENT_TRANSITIONS)).toBe(true);
    expect(canTransition('PAID', 'PARTIALLY_REFUNDED', PAYMENT_TRANSITIONS)).toBe(true);
    expect(canTransition('PARTIALLY_REFUNDED', 'REFUNDED', PAYMENT_TRANSITIONS)).toBe(true);
  });

  it('allows a failed attempt to retry', () => {
    expect(canTransition('FAILED', 'PENDING', PAYMENT_TRANSITIONS)).toBe(true);
  });

  it.each([
    ['PAID', 'PENDING'],
    ['REFUNDED', 'PAID'],
    ['REFUNDED', 'PENDING'],
    ['CANCELLED', 'PAID'],
  ] as const)('rejects illegal payment transition %s -> %s', (from, to) => {
    expect(canTransition(from, to, PAYMENT_TRANSITIONS)).toBe(false);
  });
});

describe('fulfillment transition machine', () => {
  it('allows the packing-to-delivery path and returns', () => {
    const path = ['PENDING', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED', 'RETURNED'] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1], FULFILLMENT_TRANSITIONS)).toBe(true);
    }
  });

  it('allows cancellation only before dispatch', () => {
    expect(canTransition('PENDING', 'CANCELLED', FULFILLMENT_TRANSITIONS)).toBe(true);
    expect(canTransition('PROCESSING', 'CANCELLED', FULFILLMENT_TRANSITIONS)).toBe(true);
  });

  it.each([
    ['DELIVERED', 'SHIPPED'],
    ['CANCELLED', 'PENDING'],
    ['RETURNED', 'PENDING'],
  ] as const)('rejects illegal fulfillment transition %s -> %s', (from, to) => {
    expect(canTransition(from, to, FULFILLMENT_TRANSITIONS)).toBe(false);
  });
});

describe('assertTransition', () => {
  it('does not throw for a valid transition', () => {
    expect(() => assertTransition('PENDING_PAYMENT', 'PAID', ORDER_TRANSITIONS)).not.toThrow();
  });

  it('throws a BadRequestException with a stable code for an illegal transition', () => {
    const error = (() => {
      try {
        assertTransition('PAID', 'PENDING_PAYMENT', ORDER_TRANSITIONS, 'Cannot unpay.');
      } catch (caught) {
        return caught;
      }
    })();

    expect(error).toBeInstanceOf(Error);
    const body = (error as { response?: { code: string } }).response;
    expect(body?.code).toBe('ORDER_STATE_CONFLICT');
    expect((error as { message: string }).message).toBe('Cannot unpay.');
  });
});

describe('transitionMachine', () => {
  it('exposes the registered machines', () => {
    expect(transitionMachine('order')).toBe(ORDER_TRANSITIONS);
    expect(transitionMachine('payment')).toBe(PAYMENT_TRANSITIONS);
    expect(transitionMachine('fulfillment')).toBe(FULFILLMENT_TRANSITIONS);
  });
});