import type { ApiSuccess, Money } from './index';

export type CartLine = {
  variantId: string;
  quantity: number;
  title: string;
  sku: string;
  unitPrice: Money;
  lineTotal: Money;
  available: number;
};

export type CartQuote = {
  subtotal: Money;
  shipping: Money;
  total: Money;
  currency: 'IRR';
  pricePolicyRevision: string;
  quotedAt: string;
};

export type CartView = {
  id: string;
  version: number;
  lines: CartLine[];
  quote: CartQuote;
  updatedAt: string;
};

export type CartResponse = ApiSuccess<{ cart: CartView }>;

export type CartMutationRequest = { variantId: string; quantity: number };
export type CartRemoveRequest = { variantId: string };

export type CartMergeWarning = {
  variantId: string;
  code: 'QUANTITY_CAPPED' | 'LINE_LIMIT_REACHED';
};

export type CartMergeResponse = ApiSuccess<{ cart: CartView; warnings: CartMergeWarning[] }>;

export type CheckoutAddress = {
  provinceCode: string;
  city: string;
  address: string;
  postalCode: string;
  recipient: string;
  mobile: string;
};

export type CheckoutRequest = {
  shippingMethod: string;
} & ({ address: CheckoutAddress; addressId?: never } | { addressId: string; address?: never });

export type ShippingQuote = {
  quoteId: string;
  method: string;
  amount: Money;
  policyRevision: string;
  expiresAt: string;
};

export type CheckoutPreviewResponse = ApiSuccess<{ cart: CartView; shipping: ShippingQuote[] }>;
