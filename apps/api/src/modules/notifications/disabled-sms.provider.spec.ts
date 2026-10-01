import { describe, expect, it } from 'vitest';
import { DisabledSmsProvider } from './disabled-sms.provider';

describe('DisabledSmsProvider', () => {
  it('reports a disabled send instead of an accepted message', async () => {
    const result = await new DisabledSmsProvider().send({
      purpose: 'customer_login',
      destination: '09120000000',
      templateId: 123456,
      parameters: { Code: '123456' },
      correlationId: 'req-1',
    });
    // Never 'accepted': a recorded delivery that never happened is the exact
    // failure this mode must make impossible.
    expect(result).toEqual({ status: 'disabled' });
    expect(result).not.toHaveProperty('providerMessageId');
  });

  it('is retry-safe in that it always refuses identically', async () => {
    const provider = new DisabledSmsProvider();
    const request = {
      purpose: 'order_paid' as const,
      destination: '09120000000',
      templateId: 1,
      parameters: {},
      correlationId: 'req-2',
    };
    expect(await provider.send(request)).toEqual(await provider.send(request));
  });
});
