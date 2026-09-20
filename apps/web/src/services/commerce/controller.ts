import type { CartOwner, CommerceApi, CommerceCartState } from './types'
import { EMPTY_CART } from './types'

type CryptoWithRandomUuid = Pick<Crypto, 'randomUUID'>

export class CommerceCartController {
  private state: CommerceCartState = {
    cart: EMPTY_CART,
    phase: 'idle',
    owner: 'guest',
    error: null,
    mergeWarnings: [],
    pendingVariantIds: [],
  }
  private readonly listeners = new Set<() => void>()
  private readonly retryKeys = new Map<string, string>()
  private readonly inflightMutations = new Set<Promise<unknown>>()
  private authenticated: boolean | null = null
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
    this.lastAppliedRequest = 0
    this.patch({ error: null, pendingVariantIds: [] })
    if (authenticated)
      void this.mergeAfterGuestMutations(this.authEpoch).catch(() => undefined)
    else {
      this.patch({ cart: EMPTY_CART, owner: 'guest', mergeWarnings: [] })
      void this.loadOwner('guest')
    }
  }

  async load(): Promise<void> {
    if (this.authenticated === null) return
    return this.loadOwner(this.authenticated ? 'customer' : 'guest')
  }

  async retry(): Promise<void> {
    if (this.authenticated && this.state.owner === 'guest') {
      return this.mergeGuest()
    }
    return this.load()
  }

  private async loadOwner(owner: CartOwner): Promise<void> {
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    this.patch({ phase: 'loading', owner, error: null, mergeWarnings: [] })
    try {
      const cart = await this.api.getCart(owner)
      this.applyCart(cart, requestId, epoch, owner)
    } catch (error) {
      if (this.isActive(epoch)) this.patch({ phase: 'error', error })
    }
  }

  add(variantId: string, quantity = 1): Promise<boolean> {
    return this.trackMutation(
      this.mutate(variantId, `add:${variantId}:${quantity}`, (key) =>
        this.api.addLine(this.state.owner, variantId, quantity, key),
      ),
    )
  }

  async setQuantity(variantId: string, quantity: number): Promise<void> {
    if (quantity <= 0) return this.remove(variantId)
    await this.trackMutation(
      this.mutate(variantId, `set:${variantId}:${quantity}`, (key) =>
        this.api.setLine(this.state.owner, variantId, quantity, key),
      ),
    )
  }

  async remove(variantId: string): Promise<void> {
    await this.trackMutation(
      this.mutate(variantId, `remove:${variantId}`, (key) =>
        this.api.removeLine(this.state.owner, variantId, key),
      ),
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
  ): Promise<boolean> {
    if (
      this.authenticated === null ||
      this.state.phase === 'merging' ||
      this.state.pendingVariantIds.includes(variantId)
    )
      return false
    const epoch = this.authEpoch
    const owner = this.state.owner
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
      this.applyCart(cart, requestId, epoch, owner)
      return true
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

  private trackMutation<T>(operation: Promise<T>): Promise<T> {
    this.inflightMutations.add(operation)
    void operation
      .finally(() => this.inflightMutations.delete(operation))
      .catch(() => undefined)
    return operation
  }

  private applyCart(
    cart: CommerceCartState['cart'],
    requestId: number,
    epoch: number,
    owner: CartOwner,
  ): void {
    if (!this.isActive(epoch) || requestId < this.lastAppliedRequest) return
    this.lastAppliedRequest = requestId
    this.patch({ cart, phase: 'ready', owner, error: null })
  }

  private isActive(epoch: number): boolean {
    return this.authenticated !== null && epoch === this.authEpoch
  }

  private async mergeAfterGuestMutations(epoch: number): Promise<void> {
    this.patch({ phase: 'merging', error: null })
    await Promise.allSettled([...this.inflightMutations])
    if (!this.isActive(epoch) || !this.authenticated) return
    return this.mergeGuest()
  }

  private async mergeGuest(): Promise<void> {
    if (!this.authenticated) return
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    const fingerprint = 'merge-guest'
    const key = this.retryKeys.get(fingerprint) ?? this.newKey('cart-merge')
    this.retryKeys.set(fingerprint, key)
    this.patch({ phase: 'merging', error: null, pendingVariantIds: [] })
    try {
      const result = await this.api.mergeGuestCart(key)
      if (!this.isActive(epoch) || !this.authenticated) return
      this.retryKeys.delete(fingerprint)
      if (requestId < this.lastAppliedRequest) return
      this.lastAppliedRequest = requestId
      this.patch({
        cart: result.cart,
        phase: 'ready',
        owner: 'customer',
        error: null,
        mergeWarnings: result.warnings,
      })
    } catch (error) {
      if (this.isActive(epoch) && this.authenticated) {
        this.patch({ phase: 'error', error })
      }
      throw error
    }
  }

  private newKey(prefix = 'cart'): string {
    if (typeof this.cryptoSource?.randomUUID !== 'function') {
      throw new Error('Secure random UUID generation is unavailable')
    }
    return `${prefix}-${this.cryptoSource.randomUUID()}`
  }

  private patch(partial: Partial<CommerceCartState>): void {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) listener()
  }
}
