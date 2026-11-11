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
  /** Latest quantity typed while a write for the same line is still in flight. */
  private readonly queuedQuantities = new Map<string, number>()
  private readonly quantityWrites = new Map<string, Promise<void>>()
  private authenticated: boolean | null = null
  private identityVersion: number | null = null
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

  setAuthenticated(authenticated: boolean, identityVersion = 0): void {
    if (this.authenticated === authenticated && this.identityVersion === identityVersion) return
    this.identityVersion = identityVersion
    this.authenticated = authenticated
    this.authEpoch += 1
    this.retryKeys.clear()
    this.queuedQuantities.clear()
    this.lastAppliedRequest = 0
    this.patch({ cart: EMPTY_CART, owner: 'guest', error: null, pendingVariantIds: [], mergeWarnings: [] })
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

  /**
   * Sets the absolute quantity of a line in one request. While a write for the
   * line is in flight, a newer quantity replaces any earlier queued one and is
   * sent once that write settles, so rapid edits end on the last intent without
   * one request per keystroke. The returned promise reports the final outcome.
   */
  setQuantity(variantId: string, quantity: number): Promise<void> {
    const running = this.quantityWrites.get(variantId)
    if (running && this.state.pendingVariantIds.includes(variantId)) {
      this.queuedQuantities.set(variantId, quantity)
      return running
    }
    const write = this.trackMutation(this.writeQuantities(variantId, quantity))
    this.quantityWrites.set(variantId, write)
    const forget = () => {
      if (this.quantityWrites.get(variantId) === write)
        this.quantityWrites.delete(variantId)
    }
    void write.then(forget, forget)
    return write
  }

  private async writeQuantities(variantId: string, first: number): Promise<void> {
    const epoch = this.authEpoch
    let quantity: number | undefined = first
    let continuing = false
    let holdsLine = false
    try {
      while (quantity !== undefined) {
        const target: number = quantity
        const current = this.state.cart.lines.find(
          (line) => line.variantId === variantId,
        )?.quantity
        if (!continuing || target !== (current ?? 0)) {
          try {
            const sent = await this.mutate(
              variantId,
              target <= 0 ? `remove:${variantId}` : `set:${variantId}:${target}`,
              (key) =>
                target <= 0
                  ? this.api.removeLine(this.state.owner, variantId, key)
                  : this.api.setLine(this.state.owner, variantId, target, key),
              continuing,
            )
            // Another mutation (or a merge) owns this line; nothing was sent.
            if (!sent && !continuing) return
            holdsLine = true
          } catch (error) {
            holdsLine = true
            // A newer quantity is waiting; it supersedes the failed one.
            if (!this.isActive(epoch) || !this.queuedQuantities.has(variantId))
              throw error
          }
        }
        if (!this.isActive(epoch)) return
        continuing = true
        quantity = this.queuedQuantities.get(variantId)
        this.queuedQuantities.delete(variantId)
      }
    } finally {
      if (
        holdsLine &&
        this.isActive(epoch) &&
        this.state.pendingVariantIds.includes(variantId)
      ) {
        this.queuedQuantities.delete(variantId)
        this.patch({
          pendingVariantIds: this.state.pendingVariantIds.filter(
            (id) => id !== variantId,
          ),
        })
      }
    }
  }

  async remove(variantId: string): Promise<void> {
    await this.trackMutation(
      this.mutate(variantId, `remove:${variantId}`, (key) =>
        this.api.removeLine(this.state.owner, variantId, key),
      ),
    )
  }

  /** Authoritative server validation; throws the API error so the UI can show the exact reason. */
  async applyCoupon(code: string): Promise<void> {
    if (!this.authenticated) throw new Error('Coupon requires a signed-in customer cart.')
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    const cart = await this.api.applyCoupon(code)
    this.applyCart(cart, requestId, epoch, 'customer')
  }

  async removeCoupon(): Promise<void> {
    if (!this.authenticated) return
    const epoch = this.authEpoch
    const requestId = ++this.requestSequence
    const cart = await this.api.removeCoupon()
    this.applyCart(cart, requestId, epoch, 'customer')
  }

  /**
   * Line mutations return an undiscounted view; re-read the trusted breakdown.
   * Failure is non-fatal: the cart keeps its lines and the next read corrects it.
   */
  private async refreshPromotion(epoch: number): Promise<void> {
    if (!this.isActive(epoch) || this.state.owner !== 'customer') return
    const requestId = ++this.requestSequence
    try {
      const cart = await this.api.getCart('customer')
      this.applyCart(cart, requestId, epoch, 'customer')
    } catch {
      /* keep current lines */
    }
  }

  async clear(): Promise<void> {
    for (const line of [...this.state.cart.lines])
      await this.remove(line.variantId)
  }

  private async mutate(
    variantId: string,
    fingerprint: string,
    operation: (key: string) => Promise<CommerceCartState['cart']>,
    /** The caller already holds this line's pending flag (queued quantity). */
    continuing = false,
  ): Promise<boolean> {
    if (
      this.authenticated === null ||
      this.state.phase === 'merging' ||
      (!continuing && this.state.pendingVariantIds.includes(variantId))
    )
      return false
    const epoch = this.authEpoch
    const owner = this.state.owner
    const requestId = ++this.requestSequence
    const key = this.retryKeys.get(fingerprint) ?? this.newKey()
    this.retryKeys.set(fingerprint, key)
    this.patch({
      error: null,
      pendingVariantIds: continuing
        ? this.state.pendingVariantIds
        : [...this.state.pendingVariantIds, variantId],
    })
    try {
      const cart = await operation(key)
      if (this.isActive(epoch)) this.retryKeys.delete(fingerprint)
      this.applyCart(cart, requestId, epoch, owner)
      if (owner === 'customer') await this.refreshPromotion(epoch)
      return true
    } catch (error) {
      if (this.isActive(epoch)) this.patch({ error, phase: 'error' })
      throw error
    } finally {
      // A queued quantity keeps the line pending until its own write settles.
      if (this.isActive(epoch) && !this.queuedQuantities.has(variantId)) {
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
      await this.refreshPromotion(epoch)
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
