import { describe, expect, it } from 'vitest';
import {
  FULFILLMENT_TRANSITIONS,
  ORDER_TRANSITIONS,
  ORDER_STATE_CONFLICT_ERROR,
  PAYMENT_TRANSITIONS,
  assertTransition,
  canTransition,
  recordTransition,
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

  it('throws a ConflictException (409) with a stable code for an illegal transition', () => {
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
    expect((error as { getStatus?: () => number }).getStatus?.()).toBe(409);
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

describe('recordTransition', () => {
  function makeFakeTx(dbStatus: () => string) {
    const rows: Array<{ from: string; to: string }> = [];
    return {
      rows,
      fulfillmentTransition: {
        create: async (args: { data: { from: string; to: string } }) => {
          const row = { id: `trx-${rows.length + 1}`, ...args.data };
          rows.push(row);
          return row;
        },
      },
      fulfillment: {
        updateMany: async (args: {
          where: { id: string; status: string };
          data: { status: string };
        }) => {
          if (args.where.status === dbStatus()) {
            return { count: 1 };
          }
          return { count: 0 };
        },
      },
    };
  }

  it('advances the status when the supplied current status is still current', async () => {
    const current = 'PENDING';
    const tx = makeFakeTx(() => current);
    const result = await recordTransition(
      tx as never,
      'fulfillment',
      'f1',
      'PENDING' as never,
      'PROCESSING' as never,
    );
    expect(result).toEqual({ id: 'trx-1', from: 'PENDING', to: 'PROCESSING' });
  });

  it('throws ORDER_STATE_CONFLICT on a lost update: a stale current status must fail', async () => {
    let current = 'PENDING';
    const tx = makeFakeTx(() => current);

    const first = await recordTransition(
      tx as never,
      'fulfillment',
      'f1',
      'PENDING' as never,
      'PROCESSING' as never,
    );
    expect(first.to).toBe('PROCESSING');

    // Simulate the first call having committed and advanced the aggregate before
    // the second concurrent call runs its CAS with the same stale 'PENDING'
    // current status (the lost-update window the CAS must reject).
    current = 'PROCESSING';

    let caught: unknown;
    try {
      await recordTransition(tx as never, 'fulfillment', 'f1', 'PENDING' as never, 'CANCELLED' as never);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const body = (caught as { response?: { code: string } }).response;
    expect(body?.code).toBe(ORDER_STATE_CONFLICT_ERROR);
    expect((caught as { getStatus?: () => number }).getStatus?.()).toBe(409);
    expect((caught as { message: string }).message).toContain('no longer');
  });
});