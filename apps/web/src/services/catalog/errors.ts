import type { ApiErrorCode } from '@iranyaragh/contracts'

/**
 * Normalized catalog failure shared by service implementations.
 *
 * Mirrors the auth error shape so storefront callers handle catalog and auth
 * failures uniformly, and so a future HTTP client can map the flat contract
 * error envelope into the same shape.
 */
export class CatalogError extends Error {
  readonly code: ApiErrorCode;
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(input: {
    code: ApiErrorCode;
    message: string;
    statusCode?: number;
    requestId?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = 'CatalogError';
    this.code = input.code;
    this.statusCode = input.statusCode;
    this.requestId = input.requestId;
    this.details = input.details;
  }
}
