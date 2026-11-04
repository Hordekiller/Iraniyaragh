/** Same per-variant thresholds as public inventory; never combine different variants. */
export function publicProductStockStatus(variants: ReadonlyArray<ReadonlyArray<{ available: number }>>) {
  if (!variants.length) return 'OUT_OF_STOCK' as const;
  let lowStock = false;
  for (const balances of variants) {
    const available = balances.reduce((total, balance) => total + balance.available, 0);
    if (available > 5) return 'IN_STOCK' as const;
    if (available > 0) lowStock = true;
  }
  return lowStock ? 'LOW_STOCK' as const : 'OUT_OF_STOCK' as const;
}
