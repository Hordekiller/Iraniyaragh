import { API_ERROR_CODES } from '@iranyaragh/contracts';
import { describe, expect, it } from 'vitest';
import { openApiCheckout } from './checkout.openapi';

describe('checkout public contract', () => {
  it('registers stable checkout failure codes', () => {
    for (const code of [
      'CART_EMPTY',
      'QUOTE_CHANGED',
      'SHIPPING_QUOTE_CHANGED',
      'INSUFFICIENT_STOCK',
      'IDEMPOTENCY_CONFLICT',
    ]) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });

  it('accepts intent only and never client-owned prices', () => {
    const properties = openApiCheckout.createBody.properties ?? {};
    expect(Object.keys(properties)).toEqual(['address', 'shippingQuoteId']);
    expect(properties).not.toHaveProperty('subtotal');
    expect(properties).not.toHaveProperty('shipping');
    expect(properties).not.toHaveProperty('total');
  });

  it('does not expose warehouse or location allocation in the customer response', () => {
    const data = openApiCheckout.createResponse.properties?.data;
    expect(data).toBeDefined();
    const reservations = (data as { properties?: Record<string, unknown> }).properties
      ?.reservations as { items?: { properties?: Record<string, unknown> } };

    expect(reservations.items?.properties).not.toHaveProperty('warehouseId');
    expect(reservations.items?.properties).not.toHaveProperty('locationId');
    expect(reservations.items?.properties).not.toHaveProperty('idempotencyKey');
  });
});
