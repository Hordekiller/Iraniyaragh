import { describe, expect, it } from 'vitest';
import {
  allocateNetByLine, cumulativeLineRefund, incrementalLineRefund, ReturnAmountError, shippingRefund, type PricedLine,
} from './return-amounts';

const line = (id: string, ordinal: number, quantity: number, unitPrice: bigint): PricedLine => ({
  orderItemId: id, ordinal, quantity, unitPrice, total: unitPrice * BigInt(quantity),
});

describe('allocateNetByLine', () => {
  it('returns line totals when there is no discount', () => {
    const lines = [line('a', 1, 2, 1000n), line('b', 2, 1, 500n)];
    expect([...allocateNetByLine(lines, 0n)]).toEqual([['a', 2000n], ['b', 500n]]);
  });

  it('splits the discount so that the net total is exact', () => {
    const lines = [line('a', 1, 1, 1000n), line('b', 2, 1, 1000n), line('c', 3, 1, 1000n)];
    const net = allocateNetByLine(lines, 100n); // 33.33.. each; one extra Rial goes to the first ordinal
    expect([...net.values()].reduce((s, v) => s + v, 0n)).toBe(2900n);
    expect(net.get('a')).toBe(1000n - 34n);
    expect(net.get('b')).toBe(1000n - 33n);
    expect(net.get('c')).toBe(1000n - 33n);
  });

  it('never gives a line a negative net or more than its total share', () => {
    const lines = [line('a', 1, 1, 1n), line('b', 2, 1, 999_999n)];
    const net = allocateNetByLine(lines, 1_000_000n);
    for (const value of net.values()) expect(value >= 0n).toBe(true);
    expect([...net.values()].reduce((s, v) => s + v, 0n)).toBe(0n);
  });

  it('is deterministic regardless of input order', () => {
    const lines = [line('a', 1, 1, 700n), line('b', 2, 1, 300n), line('c', 3, 1, 500n)];
    const forward = allocateNetByLine(lines, 7n);
    const reversed = allocateNetByLine([...lines].reverse(), 7n);
    expect([...forward].sort()).toEqual([...reversed].sort());
  });

  it('rejects inconsistent snapshots instead of guessing', () => {
    expect(() => allocateNetByLine([{ ...line('a', 1, 2, 10n), total: 21n }], 0n)).toThrow(ReturnAmountError);
    expect(() => allocateNetByLine([line('a', 1, 1, 10n)], 11n)).toThrow(ReturnAmountError);
    expect(() => allocateNetByLine([line('a', 1, 1, 10n)], -1n)).toThrow(ReturnAmountError);
    expect(() => allocateNetByLine([line('a', 1, 0, 10n)], 0n)).toThrow(ReturnAmountError);
  });

  it('handles a zero-priced order', () => {
    expect([...allocateNetByLine([line('a', 1, 1, 0n)], 0n)]).toEqual([['a', 0n]]);
  });
});

describe('partial quantity refunds', () => {
  it('sums to exactly the line net across any split of the quantity', () => {
    const net = 1003n; // not divisible by 3
    const split = [1, 1, 1];
    let returned = 0;
    let total = 0n;
    for (const quantity of split) { total += incrementalLineRefund(net, 3, returned, quantity); returned += quantity; }
    expect(total).toBe(net);
  });

  it('never refunds more than the net for the full quantity', () => {
    expect(cumulativeLineRefund(1003n, 3, 3)).toBe(1003n);
    expect(cumulativeLineRefund(1003n, 3, 2)).toBe(668n);
  });

  it('rejects an out-of-range returned quantity', () => {
    expect(() => cumulativeLineRefund(10n, 2, 3)).toThrow(ReturnAmountError);
  });
});

describe('shipping refund', () => {
  const lines = [line('a', 1, 2, 10n), line('b', 2, 1, 5n)];
  it('is not refunded for a partial return', () => {
    expect(shippingRefund(50n, lines, new Map([['a', 2]]))).toBe(0n);
  });
  it('is refunded once every unit has been returned', () => {
    expect(shippingRefund(50n, lines, new Map([['a', 2], ['b', 1]]))).toBe(50n);
  });
  it('is not refunded for an order without lines', () => {
    expect(shippingRefund(50n, [], new Map())).toBe(0n);
  });
});
