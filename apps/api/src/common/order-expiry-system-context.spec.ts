import { describe, expect, it } from 'vitest';
import { orderExpirySystemContext } from './order-expiry-system-context';

describe('internal order expiry identity', () => {
  it('always uses the fixed job identity without impersonating a User', () => {
    expect(orderExpirySystemContext('expiry:job-12:attempt-1')).toEqual({
      actorId: null, requestId: 'expiry:job-12:attempt-1', systemActor: 'order-reservation-expiry',
    });
  });

  it.each(['', ' ', 'expiry\nsecret', 'expiry/invalid', 'a'.repeat(129), null, undefined])(
    'rejects missing, unsafe or oversized correlation input (%#)', requestId => {
      expect(() => orderExpirySystemContext(requestId as string)).toThrow('bounded correlation ID');
    },
  );
});
