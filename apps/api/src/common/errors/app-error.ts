import { HttpStatus } from '@nestjs/common';

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  SKU_NOT_FOUND: 'SKU_NOT_FOUND',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  RESERVATION_EXPIRED: 'RESERVATION_EXPIRED',
  ORDER_STATE_CONFLICT: 'ORDER_STATE_CONFLICT',
  PAYMENT_STATE_CONFLICT: 'PAYMENT_STATE_CONFLICT',
  PAYMENT_ALREADY_VERIFIED: 'PAYMENT_ALREADY_VERIFIED',
  PAYMENT_MISMATCH: 'PAYMENT_MISMATCH',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  MIN_QUANTITY_NOT_MET: 'MIN_QUANTITY_NOT_MET',
  CART_EMPTY: 'CART_EMPTY',
  CART_NOT_FOUND: 'CART_NOT_FOUND',
  PRICE_NOT_AVAILABLE: 'PRICE_NOT_AVAILABLE',
  STOCK_ALERT_EXISTS: 'STOCK_ALERT_EXISTS',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: HttpStatus;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = 'AppError';
  }
}
