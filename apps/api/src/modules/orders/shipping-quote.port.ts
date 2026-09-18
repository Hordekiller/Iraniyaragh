import type {
  CheckoutAddress,
  CheckoutPreviewResponse,
  ShippingQuote as ShippingQuoteContract,
} from '@iranyaragh/contracts';
import type { Prisma, ShippingMethod, ShippingQuote } from '@prisma/client';

export const SHIPPING_QUOTE_PORT = Symbol('SHIPPING_QUOTE_PORT');

export type ValidatedShippingQuote = ShippingQuote & {
  shippingMethod: ShippingMethod;
};

export interface ShippingQuotePort {
  previewForUser(
    userId: string,
    address: CheckoutAddress,
  ): Promise<CheckoutPreviewResponse>;

  requireValidQuote(
    tx: Prisma.TransactionClient,
    input: {
      quoteId: string;
      customerId: string;
      cartId: string;
      cartVersion: number;
      address: CheckoutAddress;
      now: Date;
    },
  ): Promise<ValidatedShippingQuote>;
}

export function shippingQuoteContract(
  quote: ShippingQuote,
): ShippingQuoteContract {
  return {
    quoteId: quote.id,
    method: quote.methodCode,
    title: quote.methodTitle,
    amount: { amount: quote.amount.toString(), currency: 'IRR' },
    policyRevision: quote.policyRevision,
    pricePolicyRevision: quote.pricePolicyRevision,
    cartVersion: quote.cartVersion,
    expiresAt: quote.expiresAt.toISOString(),
  };
}
