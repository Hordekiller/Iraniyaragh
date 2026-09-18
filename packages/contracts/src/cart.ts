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
  id: string | null;
  version: number;
  lines: CartLine[];
  quote: CartQuote;
  updatedAt: string | null;
};

export type CartResponse = ApiSuccess<{ cart: CartView }>;

export type CartMutationRequest = { variantId: string; quantity: number };
export type CartRemoveRequest = { variantId: string };

export type CartMergeWarning = {
  variantId: string;
  code: 'QUANTITY_CAPPED' | 'LINE_LIMIT_REACHED';
};

export type CartMergeResponse = ApiSuccess<{
  cart: CartView;
  warnings: CartMergeWarning[];
}>;

export type CheckoutAddress = {
  provinceCode: string;
  city: string;
  address: string;
  postalCode: string;
  recipient: string;
  mobile: string;
};

export type CheckoutRequest = {
  address: CheckoutAddress;
  shippingQuoteId: string;
};

export type CheckoutPreviewRequest = {
  address: CheckoutAddress;
};

export type ShippingQuote = {
  quoteId: string;
  method: string;
  title: string;
  amount: Money;
  policyRevision: string;
  pricePolicyRevision: string;
  cartVersion: number;
  expiresAt: string;
};

export type CheckoutPreviewResponse = ApiSuccess<{
  cart: CartView;
  shipping: ShippingQuote[];
}>;

export type CheckoutOrderLineSnapshot = {
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  sku: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type CheckoutReservation = {
  id: string;
  variantId: string;
  quantity: number;
  expiresAt: string;
};

export type CheckoutOrder = {
  id: string;
  number: string;
  status: 'PENDING_PAYMENT';
  items: CheckoutOrderLineSnapshot[];
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  address: CheckoutAddress;
  shippingQuote: ShippingQuote;
  pricePolicyRevision: string;
  reservationExpiresAt: string;
  createdAt: string;
};

export type CheckoutResponse = ApiSuccess<{
  order: CheckoutOrder;
  reservations: CheckoutReservation[];
}>;
