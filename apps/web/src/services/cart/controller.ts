import type { CartLine, CartState, CartTotals } from './types'
import { computeCartTotals, lineTotalRials } from './types'

export const MAX_CART_QUANTITY = 99

function isValidCartLine(line: unknown): line is CartLine {
  if (!line || typeof line !== 'object') return false
  const value = line as CartLine
  return Boolean(
    typeof value.productId === 'string' &&
      value.productId.trim() &&
      typeof value.slug === 'string' &&
      typeof value.name === 'string' &&
      typeof value.image === 'string' &&
      (value.brand === null || typeof value.brand === 'string') &&
      value.unitPrice &&
      value.unitPrice.currency === 'IRR' &&
      /^\d+$/.test(value.unitPrice.amount) &&
      Number(value.unitPrice.amount) <= Number.MAX_SAFE_INTEGER &&
      Number.isSafeInteger(value.quantity) &&
      value.quantity > 0 &&
      value.quantity <= MAX_CART_QUANTITY,
  )
}

function sanitizeLines(lines: unknown[]): CartLine[] {
  const valid = lines.filter(isValidCartLine)
  const deduped = new Map<string, CartLine>()
  for (const line of valid) {
    const previous = deduped.get(line.productId)
    if (!previous) {
      deduped.set(line.productId, { ...line })
      continue
    }
    deduped.set(line.productId, {
      ...previous,
      quantity: Math.min(MAX_CART_QUANTITY, previous.quantity + line.quantity),
    })
  }
  return [...deduped.values()]
}

/**
 * Storage adapter for cart persistence. The default implementation mirrors the
 * cart to `localStorage`; tests inject a no-op/in-memory store.
 */
export interface CartStorage {
  read(): CartState
  write(state: CartState): void
}

export const CART_STORAGE_KEY = 'iranyaragh.cart.v1'

/** Parse and validate a persisted cart, ignoring malformed data. */
function parseCart(raw: string | null): CartState {
  if (!raw) return { lines: [] }
  try {
    const parsed = JSON.parse(raw) as unknown
    const lines = Array.isArray(parsed)
      ? (parsed as CartLine[])
      : (parsed as { lines?: unknown }).lines
    return { lines: sanitizeLines(Array.isArray(lines) ? lines : []) }
  } catch {
    return { lines: [] }
  }
}

/**
 * Default `CartStorage` backed by browser `localStorage`. Safe in non-browser
 * (SSR/test) environments where `localStorage` may be undefined.
 */
export class LocalCartStorage implements CartStorage {
  private readonly key: string;
  private readonly storage: Storage | null;

  constructor(key: string = CART_STORAGE_KEY) {
    this.key = key;
    try {
      this.storage = typeof window !== 'undefined' ? window.localStorage : null
    } catch {
      this.storage = null
    }
  }

  read(): CartState {
    return parseCart(this.storage?.getItem(this.key) ?? null);
  }

  write(state: CartState): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(this.key, JSON.stringify(state.lines));
    } catch {
      // Quota/security errors must not break the cart session; ignore.
    }
  }
}

/**
 * A synchronously-subscribable cart controller.
 *
 * Owns the cart state machine (add/update/remove/clear), persists through a
 * `CartStorage`, and exposes an immutable snapshot + `subscribe` for
 * `useSyncExternalStore` — mirroring the auth controller pattern so business
 * logic stays out of components (AGENTS.md).
 */
export class CartController {
  private state: CartState;
  private readonly listeners = new Set<() => void>();
  private readonly storage: CartStorage;

  constructor(storage: CartStorage) {
    this.storage = storage;
    this.state = { lines: sanitizeLines(storage.read().lines) }
  }

  getState(): CartState {
    return this.state;
  }

  getTotals(shippingRials = 0): CartTotals {
    return computeCartTotals(this.state.lines, shippingRials);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: CartState): void {
    this.state = next;
    this.storage.write(next);
    for (const listener of this.listeners) listener();
  }

  /** Add a line (or bump quantity if the product is already present). */
  add(line: CartLine): void {
    if (!isValidCartLine(line)) return
    const existing = this.state.lines.find(l => l.productId === line.productId);
    if (existing) {
      this.commit({
        lines: this.state.lines.map(l =>
          l.productId === line.productId
              ? { ...l, quantity: Math.min(MAX_CART_QUANTITY, l.quantity + line.quantity) }
            : l,
        ),
      });
      return;
    }
    this.commit({ lines: [...this.state.lines, { ...line }] });
  }

  /** Set the quantity of an existing line; removes the line at zero/negative. */
  setQuantity(productId: string, quantity: number): void {
    const nextQty = Number.isFinite(quantity)
      ? Math.min(MAX_CART_QUANTITY, Math.max(0, Math.trunc(quantity)))
      : 0
    this.commit({
      lines: this.state.lines
        .map(l => (l.productId === productId ? { ...l, quantity: nextQty } : l))
        .filter(l => l.quantity > 0),
    });
  }

  remove(productId: string): void {
    this.commit({
      lines: this.state.lines.filter(l => l.productId !== productId),
    });
  }

  clear(): void {
    this.commit({ lines: [] });
  }

  isInCart(productId: string): boolean {
    return this.state.lines.some(l => l.productId === productId);
  }

  quantityOf(productId: string): number {
    return this.state.lines.find(l => l.productId === productId)?.quantity ?? 0;
  }
}

export { lineTotalRials }
