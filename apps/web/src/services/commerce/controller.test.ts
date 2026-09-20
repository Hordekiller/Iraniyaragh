import { describe, expect, it, vi } from 'vitest'
import { CART, commerceStub } from '../../test/commerce'
import { CommerceCartController } from './controller'

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
    await expect(controller.add('variant-1', 2)).resolves.toBeUndefined()

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
})
