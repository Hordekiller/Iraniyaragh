import { describe, expect, it, vi } from 'vitest';
import { DisabledPaymentProvider } from './disabled-payment.provider';

describe('DisabledPaymentProvider', () => {
  const provider = new DisabledPaymentProvider();

  it('reports the configured gateway name so records stay attributable', () => {
    expect(provider.providerName).toBe('zarinpal');
  });

  it('refuses to authorize instead of minting an authority', async () => {
    // The whole point of the mode: with the gateway off, no code path may hand
    // back a redirect URL, because that is the first half of a paid order.
    const result = await provider.authorize({
      orderId: 'order-1',
      orderNumber: 'IR-1',
      amountMinorUnits: '100000',
      currency: 'IRR',
      callbackUrl: 'https://staging.example.com/api/v1/payments/zarinpal/callback',
      correlationId: 'req-1',
    });
    expect(result).toEqual({ status: 'disabled' });
    expect(result).not.toHaveProperty('authority');
    expect(result).not.toHaveProperty('redirectUrl');
  });

  it('refuses to verify instead of reporting a reference id', async () => {
    // Never 'verified': a settled claim here is exactly the fabricated payment
    // success this mode exists to make impossible.
    const result = await provider.verify({
      amountMinorUnits: '100000',
      currency: 'IRR',
      authority: 'A0000000000000000000000000000000001',
      correlationId: 'req-2',
    });
    expect(result).toEqual({ status: 'disabled' });
    expect(result).not.toHaveProperty('referenceId');
  });

  it('performs no network access at all', async () => {
    const originalFetch = globalThis.fetch;
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      await provider.authorize();
      await provider.verify();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
