import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { REQUIRE_AUTH_LEVEL } from '../auth/auth.guard';
import { RateLimitException } from '../auth/rate-limit.service';
import { CartMergeController } from './cart-merge.controller';
import { GuestCartController } from './guest-cart.controller';

const current = {
  token: 'a'.repeat(43),
  tokenHash: 'b'.repeat(64),
  csrfToken: 'c'.repeat(43),
};
const replacement = {
  token: 'd'.repeat(43),
  tokenHash: 'e'.repeat(64),
  csrfToken: 'f'.repeat(43),
};
const cartResponse = { data: { cart: { id: 'guest-cart-1' } } };

function response(): Response {
  return { cookie: vi.fn() } as unknown as Response;
}

function rateLimits() {
  return { enforce: vi.fn().mockResolvedValue({ allowed: true }) };
}

describe('GuestCartController', () => {
  it('uses the credential established by the preceding guest-cart read', async () => {
    const cart = {
      addForToken: vi.fn().mockResolvedValue({
        response: cartResponse,
        replacementTokenHash: null,
      }),
    };
    const guestHttp = {
      requireMutationProof: vi.fn().mockReturnValue(current),
      deriveReplacementCredentials: vi.fn().mockReturnValue([replacement]),
      set: vi.fn(),
      clear: vi.fn(),
    };
    const controller = new GuestCartController(
      cart as never,
      guestHttp as never,
      rateLimits() as never,
    );
    const res = response();

    await expect(
      controller.add(
        {} as Request,
        res,
        ' cart-00000000-0000-4000-8000-000000000001 ',
        { variantId: 'variant-1', quantity: 1 },
      ),
    ).resolves.toBe(cartResponse);
    expect(cart.addForToken).toHaveBeenCalledWith(
      current.tokenHash,
      [replacement.tokenHash],
      { variantId: 'variant-1', quantity: 1 },
      'cart-00000000-0000-4000-8000-000000000001',
    );
    expect(guestHttp.set).toHaveBeenCalledWith(res, current);
  });

  it('preserves a fresh session through empty GET and the first mutation', async () => {
    const cart = {
      getForToken: vi.fn().mockResolvedValue({
        response: cartResponse,
        credentialState: 'missing',
      }),
      addForToken: vi.fn().mockResolvedValue({
        response: cartResponse,
        replacementTokenHash: null,
      }),
    };
    const guestHttp = {
      requireBootstrapOrigin: vi.fn(),
      read: vi
        .fn()
        .mockReturnValueOnce({ credential: null, hadCookieMaterial: false })
        .mockReturnValue({
          credential: replacement,
          hadCookieMaterial: true,
        }),
      generate: vi.fn().mockReturnValue(replacement),
      requireMutationProof: vi.fn().mockReturnValue(replacement),
      deriveReplacementCredentials: vi.fn().mockReturnValue([current]),
      set: vi.fn(),
      clear: vi.fn(),
    };
    const limits = rateLimits();
    const controller = new GuestCartController(
      cart as never,
      guestHttp as never,
      limits as never,
    );
    const request = { ip: '203.0.113.11' } as Request;
    const res = response();

    await expect(controller.createSession(request, res)).resolves.toBeUndefined();
    await expect(controller.get(request, res)).resolves.toBe(cartResponse);
    await expect(
      controller.add(request, res, 'cart-first-mutation-000000000001', {
        variantId: 'variant-1',
        quantity: 1,
      }),
    ).resolves.toBe(cartResponse);
    expect(guestHttp.requireBootstrapOrigin).toHaveBeenCalledWith(request);
    expect(limits.enforce).toHaveBeenCalledWith({
      dimension: 'guest-cart:bootstrap-ip-hour',
      value: '203.0.113.11',
      context: 'ip',
    });
    expect(guestHttp.set).toHaveBeenCalledWith(res, replacement);
    expect(guestHttp.clear).not.toHaveBeenCalled();
    expect(cart.addForToken).toHaveBeenCalledWith(
      replacement.tokenHash,
      [current.tokenHash],
      { variantId: 'variant-1', quantity: 1 },
      'cart-first-mutation-000000000001',
    );
  });

  it('keeps an active credential and clears malformed proof on rejection', async () => {
    const cart = {
      removeForToken: vi.fn().mockResolvedValue({
        response: cartResponse,
        replacementTokenHash: null,
      }),
    };
    const guestHttp = {
      requireMutationProof: vi.fn().mockReturnValue(current),
      deriveReplacementCredentials: vi.fn().mockReturnValue([replacement]),
      set: vi.fn(),
      clear: vi.fn(),
    };
    const controller = new GuestCartController(
      cart as never,
      guestHttp as never,
      rateLimits() as never,
    );
    const res = response();

    await controller.remove({} as Request, res, 'remove-1', ' variant-1 ');
    expect(guestHttp.set).toHaveBeenCalledWith(res, current);

    guestHttp.requireMutationProof.mockImplementationOnce(() => {
      throw new ForbiddenException();
    });
    await expect(
      controller.remove({} as Request, res, 'remove-2', 'variant-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(guestHttp.clear).toHaveBeenCalledWith(res);
  });

  it('rejects a body/path mismatch before any cart side effect', async () => {
    const cart = { setForToken: vi.fn() };
    const guestHttp = { requireMutationProof: vi.fn() };
    const controller = new GuestCartController(
      cart as never,
      guestHttp as never,
      rateLimits() as never,
    );

    await expect(
      controller.set(
        {} as Request,
        response(),
        'set-1',
        'variant-1',
        { variantId: 'variant-2', quantity: 2 },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(guestHttp.requireMutationProof).not.toHaveBeenCalled();
    expect(cart.setForToken).not.toHaveBeenCalled();
  });

  it('fails closed on distributed rate limiting without clearing a valid cart credential', async () => {
    const guestHttp = {
      requireMutationProof: vi.fn().mockReturnValue(current),
      clear: vi.fn(),
    };
    const limits = {
      enforce: vi.fn().mockRejectedValue(new RateLimitException(30)),
    };
    const controller = new GuestCartController(
      {} as never,
      guestHttp as never,
      limits as never,
    );

    await expect(
      controller.remove(
        { ip: '203.0.113.10' } as Request,
        response(),
        'remove-rate-limited',
        'variant-1',
      ),
    ).rejects.toBeInstanceOf(RateLimitException);
    expect(guestHttp.clear).not.toHaveBeenCalled();
  });
});

describe('CartMergeController', () => {
  it('requires verified customer OTP at the controller boundary', () => {
    expect(Reflect.getMetadata(REQUIRE_AUTH_LEVEL, CartMergeController)).toBe(
      'CUSTOMER_OTP',
    );
  });

  it('merges for the OTP principal and clears the guest cookies after success', async () => {
    const mergeResponse = {
      data: { cart: { id: 'customer-cart-1' }, warnings: [] },
    };
    const cart = { mergeForUser: vi.fn().mockResolvedValue(mergeResponse) };
    const guestHttp = {
      requireOptionalMutationProof: vi.fn().mockReturnValue(current),
      clear: vi.fn(),
    };
    const controller = new CartMergeController(
      cart as never,
      guestHttp as never,
    );
    const res = response();

    await expect(
      controller.merge(
        { userId: 'user-1' } as never,
        {} as Request,
        res,
        ' merge-1 ',
      ),
    ).resolves.toBe(mergeResponse);
    expect(cart.mergeForUser).toHaveBeenCalledWith(
      'user-1',
      current.tokenHash,
      'merge-1',
      'no-request-id',
    );
    expect(guestHttp.clear).toHaveBeenCalledWith(res);
  });

  it('allows an authenticated same-key replay after success cleared guest cookies', async () => {
    const mergeResponse = {
      data: { cart: { id: 'customer-cart-1' }, warnings: [] },
    };
    const cart = { mergeForUser: vi.fn().mockResolvedValue(mergeResponse) };
    const guestHttp = {
      requireOptionalMutationProof: vi.fn().mockReturnValue(null),
      clear: vi.fn(),
    };
    const controller = new CartMergeController(
      cart as never,
      guestHttp as never,
    );

    await controller.merge(
      { userId: 'user-1' } as never,
      {} as Request,
      response(),
      'merge-replay-1',
    );

    expect(cart.mergeForUser).toHaveBeenCalledWith(
      'user-1',
      null,
      'merge-replay-1',
      'no-request-id',
    );
  });
});
