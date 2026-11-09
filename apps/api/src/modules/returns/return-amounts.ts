/**
 * Refund arithmetic for order returns. Integer Rial only, no floating point.
 *
 * Policy (owner-approved): the refundable amount of a returned line is its price
 * minus that line's share of the order discount. Shipping is refunded only once
 * every unit of the order has been returned.
 *
 * Rounding is deterministic and exact: the order discount is split across lines
 * by the largest-remainder method (ties by ordinal) and a partial quantity is
 * refunded as a floor of the cumulative share, so returning everything always
 * refunds exactly `grandTotal`, never a Rial more or less.
 */
export type PricedLine = {
  orderItemId: string;
  ordinal: number;
  quantity: number;
  unitPrice: bigint;
  total: bigint;
};

export class ReturnAmountError extends Error {}

/** Net (post-discount) amount the customer paid for each whole line. */
export function allocateNetByLine(lines: readonly PricedLine[], discount: bigint): Map<string, bigint> {
  if (discount < 0n) throw new ReturnAmountError('Discount cannot be negative.');
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new ReturnAmountError('Line quantity must be a positive integer.');
    if (line.unitPrice < 0n || line.total !== line.unitPrice * BigInt(line.quantity)) {
      throw new ReturnAmountError('Line total does not match its immutable unit price.');
    }
  }
  const subtotal = lines.reduce((sum, line) => sum + line.total, 0n);
  if (discount > subtotal) throw new ReturnAmountError('Discount exceeds the order subtotal.');
  if (subtotal === 0n) return new Map(lines.map((line) => [line.orderItemId, 0n]));

  const shares = lines.map((line) => {
    const numerator = discount * line.total;
    return { line, share: numerator / subtotal, remainder: numerator % subtotal };
  });
  let leftover = discount - shares.reduce((sum, row) => sum + row.share, 0n);
  const byRemainder = [...shares].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.line.ordinal - b.line.ordinal;
  });
  for (const row of byRemainder) {
    if (leftover === 0n) break;
    row.share += 1n;
    leftover -= 1n;
  }
  return new Map(shares.map((row) => [row.line.orderItemId, row.line.total - row.share]));
}

/** Net amount attributable to `returnedQuantity` of a line, as a floor of the cumulative share. */
export function cumulativeLineRefund(net: bigint, quantity: number, returnedQuantity: number): bigint {
  if (returnedQuantity < 0 || returnedQuantity > quantity) throw new ReturnAmountError('Returned quantity is out of range.');
  return (net * BigInt(returnedQuantity)) / BigInt(quantity);
}

/** Refund for returning `quantity` more units when `alreadyReturned` were returned before. */
export function incrementalLineRefund(net: bigint, orderedQuantity: number, alreadyReturned: number, quantity: number): bigint {
  return cumulativeLineRefund(net, orderedQuantity, alreadyReturned + quantity) - cumulativeLineRefund(net, orderedQuantity, alreadyReturned);
}

/** Shipping becomes refundable only when the whole order has been returned. */
export function shippingRefund(shipping: bigint, lines: readonly PricedLine[], returnedAfter: ReadonlyMap<string, number>): bigint {
  const complete = lines.length > 0 && lines.every((line) => (returnedAfter.get(line.orderItemId) ?? 0) === line.quantity);
  return complete ? shipping : 0n;
}
