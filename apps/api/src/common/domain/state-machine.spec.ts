import { AppError } from '../errors/app-error';
import {
  FULFILLMENT_TRANSITIONS,
  guardTransition,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
} from './state-machine';

describe('order state machine', () => {
  it('allows PENDING_PAYMENT -> PAID and updates order to PAID', () => {
    const next = guardTransition('PENDING_PAYMENT', 'PAID', ORDER_TRANSITIONS);
    expect(next).toBe('PAID');
  });

  it('rejects illegal transition PAID -> PENDING_PAYMENT', () => {
    expect(() =>
      guardTransition('PAID', 'PENDING_PAYMENT', ORDER_TRANSITIONS),
    ).toThrow(AppError);
  });

  it('never allows a terminal state to transition', () => {
    expect(() => guardTransition('CANCELLED', 'PAID', ORDER_TRANSITIONS)).toThrow(AppError);
  });
});

describe('payment state machine', () => {
  it('allows PENDING -> PAID and FAILED -> PENDING (retry)', () => {
    expect(guardTransition('PENDING', 'PAID', PAYMENT_TRANSITIONS)).toBe('PAID');
    expect(guardTransition('FAILED', 'PENDING', PAYMENT_TRANSITIONS)).toBe('PENDING');
  });

  it('rejects double-apply PAID -> PAID', () => {
    expect(() => guardTransition('PAID', 'PAID', PAYMENT_TRANSITIONS)).toThrow(AppError);
  });
});

describe('fulfillment state machine', () => {
  it('walks the forward chain only', () => {
    expect(guardTransition('UNFULFILLED', 'PROCESSING', FULFILLMENT_TRANSITIONS)).toBe('PROCESSING');
    expect(() => guardTransition('SHIPPED', 'PROCESSING', FULFILLMENT_TRANSITIONS)).toThrow(AppError);
  });
});
