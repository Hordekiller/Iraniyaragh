import type { CommerceApi, CommerceCartState } from './types'
import { EMPTY_CART } from './types'

type CryptoWithRandomUuid = Pick<Crypto, 'randomUUID'>

export class CommerceCartController {
  private state: CommerceCartState = {
    cart: EMPTY_CART,
    phase: 'anonymous',
    error: null,
    pendingVariantIds: [],
  }
  private readonly listeners = new Set<() => void>()
  private readonly retryKeys = new Map<string, string>()
  private authenticated = false
  private authEpoch = 0
  private requestSequence = 0
  private lastAppliedRequest = 0

  constructor(
    private readonly api: CommerceApi,
    private readonly cryptoSource:
      CryptoWithRandomUuid | null | undefined = globalThis.crypto,
  ) {}

  getState = (): CommerceCartState => this.state

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setAuthenticated(authenticated: boolean): void {
    if (this.authenticated === authenticated) return
    this.authenticated = authenticated
    this.authEpoch += 1
    this.retryKeys.clear()
    if (!authenticated) {
      this.patch({
        cart: EMPTY_CART,
        phase: 'anonymous',
        error: null,
        pendingVariantIds: [],
      })
      return
    }
    void this.load()
  }

  async load(): Promise<void> {
    if (!this.authenticated) return
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    this.patch({ phase: 'loading', error: null })
    try {
      const cart = await this.api.getCart()
      this.applyCart(cart, requestId, epoch)
    } catch (error) {
      if (this.isActive(epoch)) this.patch({ phase: 'error', error })
    }
  }

  async add(variantId: string, quantity = 1): Promise<void> {
    return this.mutate(variantId, `add:${variantId}:${quantity}`, (key) =>
      this.api.addLine(variantId, quantity, key),
    )
  }

  async setQuantity(variantId: string, quantity: number): Promise<void> {
    if (quantity <= 0) return this.remove(variantId)
    return this.mutate(variantId, `set:${variantId}:${quantity}`, (key) =>
      this.api.setLine(variantId, quantity, key),
    )
  }

  async remove(variantId: string): Promise<void> {
    return this.mutate(variantId, `remove:${variantId}`, (key) =>
      this.api.removeLine(variantId, key),
    )
  }

  async clear(): Promise<void> {
    for (const line of [...this.state.cart.lines])
      await this.remove(line.variantId)
  }

  private async mutate(
    variantId: string,
    fingerprint: string,
    operation: (key: string) => Promise<CommerceCartState['cart']>,
  ): Promise<void> {
    if (!this.authenticated || this.state.pendingVariantIds.includes(variantId))
      return
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    const key = this.retryKeys.get(fingerprint) ?? this.newKey()
    this.retryKeys.set(fingerprint, key)
    this.patch({
      error: null,
      pendingVariantIds: [...this.state.pendingVariantIds, variantId],
    })
    try {
      const cart = await operation(key)
      if (this.isActive(epoch)) this.retryKeys.delete(fingerprint)
      this.applyCart(cart, requestId, epoch)
    } catch (error) {
      if (this.isActive(epoch)) this.patch({ error, phase: 'error' })
      throw error
    } finally {
      if (this.isActive(epoch)) {
        this.patch({
          pendingVariantIds: this.state.pendingVariantIds.filter(
            (id) => id !== variantId,
          ),
        })
      }
    }
  }

  private applyCart(
    cart: CommerceCartState['cart'],
    requestId: number,
    epoch: number,
  ): void {
    if (!this.isActive(epoch) || requestId < this.lastAppliedRequest) return
    this.lastAppliedRequest = requestId
    this.patch({ cart, phase: 'ready', error: null })
  }

  private isActive(epoch: number): boolean {
    return this.authenticated && epoch === this.authEpoch
  }

  private newKey(): string {
    if (typeof this.cryptoSource?.randomUUID !== 'function') {
      throw new Error('Secure random UUID generation is unavailable')
    }
    return `cart-${this.cryptoSource.randomUUID()}`
  }

  private patch(partial: Partial<CommerceCartState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }
}
