import { describe, expect, it } from 'vitest';
import { ApiAbortError, ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { parseStocktakeQuantity, stocktakeError, stocktakeOutcomeIsUncertain } from './stocktake-errors';

describe('Stocktake operator quantities and uncertain results', () => {
  it.each([['0', 0], ['۲۳', 23], ['١٢', 12], ['2147483647', 2_147_483_647], ['', null], ['-1', null], ['1.5', null], ['1e2', null], ['2147483648', null]])('parses %s without floats/exponents or silent empty-to-zero conversion',
    (value, result) => expect(parseStocktakeQuantity(value)).toBe(result));
  it('keeps network/abort/server and retryable outcomes ambiguous', () => {
    for (const error of [new ApiNetworkError('offline'), new ApiAbortError(), new ApiClientError({ code: 'INTERNAL_ERROR', requestId: 'r', statusCode: 500, message: 'private' })]) {
      expect(stocktakeOutcomeIsUncertain(error)).toBe(true);
      expect(stocktakeError(error)).not.toContain('private');
    }
    const conflict = new ApiClientError({ code: 'STOCKTAKE_VERSION_CONFLICT', requestId: 'r', statusCode: 409, message: 'private' });
    expect(stocktakeOutcomeIsUncertain(conflict)).toBe(false);
    expect(stocktakeError(conflict)).toContain('بازخوانی');
  });
});
