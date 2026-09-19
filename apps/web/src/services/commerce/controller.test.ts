import { describe, expect, it, vi } from 'vitest'
import { CART, commerceStub } from '../../test/commerce'
import { CommerceCartController } from './controller'

const cryptoSource = {
  randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000001' as const),
}

async function authenticatedController(api = commerceStub()) {
  const controller = new CommerceCartController(api, cryptoSource)
  controller.setAuthenticated(true)
  await vi.waitFor(() => expect(api.getCart).toHaveBeenCalledOnce())
  await vi.waitFor(() => expect(controller.getState().phase).toBe('ready'))
  return { api, controller }
}

describe('CommerceCartController', () => {
  it('does not read or mutate a cart for an anonymous visitor', async () => {
    const api = commerceStub()
    const controller = new CommerceCartController(api, cryptoSource)

    await controller.load()
    await controller.add('variant-1')

    expect(api.getCart).not.toHaveBeenCalled()
    expect(api.addLine).not.toHaveBeenCalled()
    expect(controller.getState().phase).toBe('anonymous')
  })

  it('reuses the same idempotency key when an identical failed mutation is retried', async () => {
    const api = commerceStub({
      addLine: vi
        .fn()
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce(CART),
    })
    const { controller } = await authenticatedController(api)

    await expect(controller.add('variant-1', 2)).rejects.toThrow('network')
    await expect(controller.add('variant-1', 2)).resolves.toBeUndefined()

    expect(api.addLine).toHaveBeenCalledTimes(2)
    expect(vi.mocked(api.addLine).mock.calls[0]?.[2]).toBe(
      vi.mocked(api.addLine).mock.calls[1]?.[2],
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
    const { controller } = await authenticatedController(api)

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
    controller.setAuthenticated(true)
    await vi.waitFor(() => expect(api.getCart).toHaveBeenCalledOnce())

    await controller.add('variant-1')
    expect(controller.getState().cart.version).toBe(newerCart.version)

    finishLoad?.(CART)
    await initialLoad
    expect(controller.getState().cart.version).toBe(newerCart.version)
  })

  it('clears customer cart state immediately after sign-out', async () => {
    const { controller } = await authenticatedController()
    expect(controller.getState().cart.id).toBe(CART.id)

    controller.setAuthenticated(false)

    expect(controller.getState()).toMatchObject({
      phase: 'anonymous',
      cart: { id: null, lines: [] },
      pendingVariantIds: [],
    })
  })
})
