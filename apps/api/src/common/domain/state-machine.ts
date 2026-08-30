import { AppError, ErrorCode, ErrorCodes } from '../errors/app-error';

/**
 * FOUNDATION: order state is controlled by a state machine; clients may request
 * commands, never assign arbitrary states. Transitions are defined explicitly
 * here so illegal transitions return a stable conflict error.
 */
export function guardTransition<TState extends string>(
  current: TState,
  next: TState,
  allowed: Record<TState, readonly TState[]>,
  conflictCode: ErrorCode = ErrorCodes.ORDER_STATE_CONFLICT,
): TState {
  const legal = allowed[current];
  if (!legal || !legal.includes(next)) {
    throw new AppError(conflictCode, `Illegal transition: ${current} -> ${next}`, 409);
  }
  return next;
}

export const ORDER_TRANSITIONS = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAID', 'CANCELLED', 'RETURNED'],
  PAID: ['CANCELLED', 'RETURNED'],
  CANCELLED: [],
  RETURNED: [],
} as const;

export const FULFILLMENT_TRANSITIONS = {
  UNFULFILLED: ['PROCESSING'],
  PROCESSING: ['READY_TO_SHIP'],
  READY_TO_SHIP: ['SHIPPED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
} as const;

export const PAYMENT_TRANSITIONS = {
  PENDING: ['PAID', 'FAILED', 'CANCELLED'],
  PAID: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  FAILED: ['PENDING'],
  CANCELLED: ['PENDING'],
  REFUNDED: [],
  PARTIALLY_REFUNDED: [],
} as const;
