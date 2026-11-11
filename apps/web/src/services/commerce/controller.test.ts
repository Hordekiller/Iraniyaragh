import { describe, expect, it, vi } from 'vitest'
import { CART, commerceStub } from '../../test/commerce'
import { CommerceCartController } from './controller'
import type { CartMergeResult } from './types'

const cryptoSource = {
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001' as const),
}

async function guestController(api = commerceStub()) {
  const controller = new CommerceCartController(api, cryptoSource)
  controller.setAuthenticated(false)
  await vi.waitFor(() => expect(api.getCart).toHaveBeenCalledWith('guest'))
  await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
  return { api, controller }
}

async function authenticatedController(api = commerceStub()) {
  const controller = new CommerceCartController(api, cryptoSource)
  controller.setAuthenticated(true)
  await vi.waitFor(() => expect(api.mergeGuestCart).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
  return { api, controller }
}

describe('CommerceCartController', () => {
  it('clears a previous customer cart when the login identity changes without an anonymous interval', async () => {
    let finish!: (value: CartMergeResult) => void
    const api = commerceStub({ mergeGuestCart: vi.fn().mockResolvedValueOnce({ cart: CART, warnings: [] }).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve })) })
    const controller = new CommerceCartController(api, cryptoSource)
    controller.setAuthenticated(true, 1)
    await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
    controller.setAuthenticated(true, 2)
    expect(controller.getState().cart.lines).toEqual([])
    await vi.waitFor(() => expect(api.mergeGuestCart).toHaveBeenCalledTimes(2))
    finish({ cart: { ...CART, lines: [] }, warnings: [] })
    await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
    controller.setAuthenticated(true, 2)
    expect(api.mergeGuestCart).toHaveBeenCalledTimes(2)
  })
  it('loads and mutates the server-owned Guest Cart before sign-in', async () => {
    const api = commerceStub()
    const { controller } = await guestController(api)

    await controller.add('variant-1')

    expect(api.getCart).toHaveBeenCalledWith('guest')
    expect(api.addLine).toHaveBeenCalledWith(
      'guest',
      'variant-1',
      1,
      'cart-00000000-0000-4000-8000-000000000001',
    )
    expect(controller.getState()).toMatchObject({
      phase: 'ready',
      owner: 'guest',
      cart: CART,
    })
  })

  it('reuses the same idempotency key when an identical failed mutation is retried', async () => {
    const api = commerceStub({
      addLine: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(CART),
    })
    const { controller } = await guestController(api)

    await expect(controller.add('variant-1', 2)).rejects.toThrow('network')
    await expect(controller.add('variant-1', 2)).resolves.toBe(true)

    expect(api.addLine).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.addLine).mock.calls[0]?.[3]).toBe(
      vi.mocked(api.addLine).mock.calls[1]?.[3],
    )
    expect(controller.getState()).toMatchObject({
      phase: 'ready',
      error: null,
      cart: CART,
    })
  })

  it('suppresses duplicate concurrent mutations for the same variant', async () => {
    let finish: ((cart: typeof CART) => void) | undefined
    const pending = new Promise<typeof CART>((resolve) => {
      finish = resolve
    })
    const api = commerceStub({ addLine: vi.fn(() => pending) })
    const { controller } = await guestController(api)

    const first = controller.add('variant-1')
    const duplicate = controller.add('variant-1')

    expect(api.addLine).toHaveBeenCalledOnce()
    expect(controller.getState().pendingVariantIds).toEqual(['variant-1'])
    await duplicate
    finish?.(CART)
    await first
    expect(controller.getState().pendingVariantIds).toEqual([])
  })

  it('waits for an in-flight Guest mutation before merging after authentication', async () => {
    let finishMutation: ((cart: typeof CART) => void) | undefined
    const mutation = new Promise<typeof CART>((resolve) => {
      finishMutation = resolve
    })
    const api = commerceStub({ addLine: vi.fn(() => mutation) })
    const { controller } = await guestController(api)

    const add = controller.add('variant-1')
    await vi.waitFor(() => expect(api.addLine).toHaveBeenCalledOnce())
    controller.setAuthenticated(true)

    expect(controller.getState().phase).toBe('merging')
    expect(api.mergeGuestCart).not.toHaveBeenCalled()

    finishMutation?.(CART)
    await expect(add).resolves.toBe(true)
    await vi.waitFor(() => expect(api.mergeGuestCart).toHaveBeenCalledOnce())
    await vi.waitFor(() => expect(controller.getState().owner).toBe('customer'))
  })

  it('reports a skipped add instead of fabricating success during merge', async () => {
    let finishMerge: ((result: CartMergeResult) => void) | undefined
    const merge = new Promise<CartMergeResult>((resolve) => {
      finishMerge = resolve
    })
    const api = commerceStub({ mergeGuestCart: vi.fn(() => merge) })
    const controller = new CommerceCartController(api, cryptoSource)
    controller.setAuthenticated(true)

    await expect(controller.add('variant-1')).resolves.toBe(false)
    expect(api.addLine).not.toHaveBeenCalled()
    finishMerge?.({ cart: CART, warnings: [] })
    await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
  })

  it('does not let a late initial load overwrite a newer mutation response', async () => {
    let finishLoad: ((cart: typeof CART) => void) | undefined
    const initialLoad = new Promise<typeof CART>((resolve) => {
      finishLoad = resolve
    })
    const newerCart = { ...CART, version: CART.version + 1 }
    const api = commerceStub({
      getCart: vi.fn(() => initialLoad),
      addLine: vi.fn(async () => newerCart),
    })
    const controller = new CommerceCartController(api, cryptoSource)
    controller.setAuthenticated(false)
    await vi.waitFor(() => expect(api.getCart).toHaveBeenCalledWith('guest'))

    await controller.add('variant-1')
    expect(controller.getState().cart.version).toBe(newerCart.version)

    finishLoad?.(CART)
    await initialLoad
    expect(controller.getState().cart.version).toBe(newerCart.version)
  })

  it('merges after OTP authentication and exposes stable warnings', async () => {
    const api = commerceStub({
      mergeGuestCart: vi.fn(async () => ({
        cart: CART,
        warnings: [
          { variantId: 'variant-1', code: 'QUANTITY_CAPPED' as const },
        ],
      })),
    })
    const controller = new CommerceCartController(api, cryptoSource)
    controller.setAuthenticated(false)
    await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))

    controller.setAuthenticated(true)

    await vi.waitFor(() => expect(controller.getState().owner).toBe('customer'))
    expect(api.mergeGuestCart).toHaveBeenCalledWith(
      'cart-merge-00000000-0000-4000-8000-000000000001',
    )
    expect(controller.getState().mergeWarnings).toEqual([
      { variantId: 'variant-1', code: 'QUANTITY_CAPPED' },
    ])
  })

  it('retries an ambiguous merge with the same idempotency key', async () => {
    const api = commerceStub({
      mergeGuestCart: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ cart: CART, warnings: [] }),
    })
    const controller = new CommerceCartController(api, cryptoSource)
    controller.setAuthenticated(true)
    await vi.waitFor(() => expect(controller.getState().phase).toBe('error'))

    await controller.retry()

    expect(api.mergeGuestCart).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.mergeGuestCart).mock.calls[0]?.[0]).toBe(
      vi.mocked(api.mergeGuestCart).mock.calls[1]?.[0],
    )
    expect(controller.getState()).toMatchObject({
      phase: 'ready',
      owner: 'customer',
    })
  })

  it('clears customer cart state immediately after sign-out and reloads Guest Cart', async () => {
    const { api, controller } = await authenticatedController()
    expect(controller.getState().cart.id).toBe(CART.id)

    controller.setAuthenticated(false)

    expect(controller.getState()).toMatchObject({
      phase: 'loading',
      owner: 'guest',
      cart: { id: null, lines: [] },
      pendingVariantIds: [],
    })
    await vi.waitFor(() => expect(api.getCart).toHaveBeenCalledWith('guest'))
  })
  describe('direct quantity entry', () => {
    const withQuantity = (quantity: number) => ({
      ...CART,
      lines: quantity > 0 ? [{ ...CART.lines[0], quantity }] : [],
    })
    const deferred = () => {
      let resolve!: (cart: typeof CART) => void
      let reject!: (error: unknown) => void
      const promise = new Promise<typeof CART>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    it('sets a typed quantity of 100 with one absolute request, never repeated increments', async () => {
      const api = commerceStub({
        setLine: vi.fn(async (_owner, _id, quantity: number) => withQuantity(quantity)),
      })
      const { controller } = await guestController(api)

      await controller.setQuantity('variant-1', 100)

      expect(api.setLine).toHaveBeenCalledOnce()
      expect(api.setLine).toHaveBeenCalledWith('guest', 'variant-1', 100, expect.stringMatching(/^cart-/))
      expect(api.addLine).not.toHaveBeenCalled()
      expect(controller.getState().cart.lines[0]?.quantity).toBe(100)
    })

    it('coalesces rapid edits: only the latest quantity follows the in-flight write', async () => {
      const first = deferred()
      const setLine = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementation(async (_owner, _id, quantity: number) => withQuantity(quantity))
      const api = commerceStub({ setLine })
      const { controller } = await guestController(api)

      const a = controller.setQuantity('variant-1', 3)
      const b = controller.setQuantity('variant-1', 50)
      const c = controller.setQuantity('variant-1', 100)
      expect(setLine).toHaveBeenCalledOnce()

      first.resolve(withQuantity(3))
      await Promise.all([a, b, c])

      expect(setLine.mock.calls.map((call) => call[2])).toEqual([3, 100])
      expect(controller.getState().cart.lines[0]?.quantity).toBe(100)
      expect(controller.getState().pendingVariantIds).toEqual([])
    })

    it('keeps the line pending between an in-flight write and its queued follow-up', async () => {
      const first = deferred()
      const second = deferred()
      const setLine = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
      const { controller } = await guestController(commerceStub({ setLine }))
      const seen: string[][] = []
      controller.subscribe(() => seen.push(controller.getState().pendingVariantIds))

      const write = controller.setQuantity('variant-1', 3)
      void controller.setQuantity('variant-1', 100)
      first.resolve(withQuantity(3))
      await vi.waitFor(() => expect(setLine).toHaveBeenCalledTimes(2))
      expect(seen.every((ids) => ids.includes('variant-1'))).toBe(true)

      second.resolve(withQuantity(100))
      await write
      expect(controller.getState().pendingVariantIds).toEqual([])
    })

    it('does not let a stale response replace the newer quantity', async () => {
      const first = deferred()
      const setLine = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementation(async (_owner, _id, quantity: number) => withQuantity(quantity))
      const { controller } = await guestController(commerceStub({ setLine }))

      const write = controller.setQuantity('variant-1', 7)
      void controller.setQuantity('variant-1', 250)
      first.resolve(withQuantity(7))
      await write

      expect(controller.getState().cart.lines[0]?.quantity).toBe(250)
    })

    it('reports a network failure, keeps the server quantity and retries with the same key', async () => {
      const setLine = vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockImplementation(async (_owner, _id, quantity: number) => withQuantity(quantity))
      const { controller } = await guestController(commerceStub({ setLine }))

      await expect(controller.setQuantity('variant-1', 100)).rejects.toThrow('network')
      expect(controller.getState().cart.lines[0]?.quantity).toBe(2)
      expect(controller.getState().pendingVariantIds).toEqual([])

      await controller.setQuantity('variant-1', 100)
      expect(setLine.mock.calls[0]?.[3]).toBe(setLine.mock.calls[1]?.[3])
      expect(controller.getState().cart.lines[0]?.quantity).toBe(100)
    })

    it('still sends the latest quantity when the write before it failed', async () => {
      const first = deferred()
      const setLine = vi
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementation(async (_owner, _id, quantity: number) => withQuantity(quantity))
      const { controller } = await guestController(commerceStub({ setLine }))

      const a = controller.setQuantity('variant-1', 3)
      const b = controller.setQuantity('variant-1', 100)
      first.reject(new Error('network'))

      await expect(Promise.all([a, b])).resolves.toBeDefined()
      expect(controller.getState()).toMatchObject({ phase: 'ready', error: null })
      expect(controller.getState().cart.lines[0]?.quantity).toBe(100)
    })

    it('removes the line when the queued quantity is zero', async () => {
      const first = deferred()
      const api = commerceStub({
        setLine: vi.fn(() => first.promise),
        removeLine: vi.fn(async () => withQuantity(0)),
      })
      const { controller } = await guestController(api)

      const write = controller.setQuantity('variant-1', 3)
      void controller.setQuantity('variant-1', 0)
      first.resolve(withQuantity(3))
      await write

      expect(api.removeLine).toHaveBeenCalledOnce()
      expect(controller.getState().cart.lines).toEqual([])
    })

    it('does not release a line that an in-flight add still owns', async () => {
      const adding = deferred()
      const api = commerceStub({ addLine: vi.fn(() => adding.promise) })
      const { controller } = await guestController(api)

      const add = controller.add('variant-1', 100)
      await controller.setQuantity('variant-1', 5)

      expect(api.setLine).not.toHaveBeenCalled()
      expect(controller.getState().pendingVariantIds).toEqual(['variant-1'])
      adding.resolve(withQuantity(100))
      await add
      expect(controller.getState().pendingVariantIds).toEqual([])
    })
  })
})
