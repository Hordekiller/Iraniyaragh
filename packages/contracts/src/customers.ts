import type { ApiSuccess } from './api';
import type { Money } from './index';
import type { OrderListMeta, OrderStatus, PaymentStatus, FulfillmentStatus } from './orders';

export const CUSTOMER_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export const CUSTOMER_NOTE_VISIBILITIES = ['INTERNAL', 'CUSTOMER_VISIBLE'] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type CustomerNoteVisibility = (typeof CUSTOMER_NOTE_VISIBILITIES)[number];

/** Self-service customer projection. It intentionally excludes staff notes and order PII. */
export type CustomerAccount = {
  id: string;
  mobile: string;
  firstName: string | null;
  lastName: string | null;
  version: number;
  addresses: AdminCustomerAddress[];
};

export type CustomerAccountResponse = ApiSuccess<{ account: CustomerAccount }>;

export type CustomerAccountUpdateRequest = {
  expectedVersion: number;
  firstName?: string | null;
  lastName?: string | null;
};

export type CustomerAccountAddressesRequest = {
  expectedVersion: number;
  addresses: Array<{
    label: string;
    receiverName: string;
    mobile: string;
    provinceCode: string;
    city: string;
    addressLine: string;
    postalCode?: string | null;
    isDefault?: boolean;
  }>;
};

/**
 * Staff-facing customer record.
 *
 * The mobile is returned in full to `customers.read`: identifying and contacting
 * a customer is the purpose of the staff directory, and the number is the
 * record's unique key. This is deliberately NOT a customer-facing contract, and
 * the order history embedded in the detail is projected through the same masked
 * order shapes that `orders.read` uses, so a customer read never becomes a wider
 * window onto delivery-address PII than the order read already is.
 */
export type AdminCustomerSummary = {
  id: string;
  /** Canonical E.164 (`+989XXXXXXXXX`), normalized on write. */
  mobile: string;
  firstName: string | null;
  lastName: string | null;
  status: CustomerStatus;
  version: number;
  orderCount: number;
  hasUserAccount: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminCustomerAddress = {
  id: string;
  label: string;
  receiverName: string;
  mobile: string;
  provinceCode: string;
  city: string;
  addressLine: string;
  postalCode: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminCustomerNoteAuthor = {
  id: string;
  displayNameMasked: string | null;
};

export type AdminCustomerNote = {
  id: string;
  visibility: CustomerNoteVisibility;
  body: string;
  author: AdminCustomerNoteAuthor | null;
  createdAt: string;
};

/**
 * Bounded order history entry. Payment and fulfillment state are denormalised
 * from the order's own current state; money is a string amount and no address
 * or contact PII is included.
 */
export type AdminCustomerOrder = {
  id: string;
  number: string;
  status: OrderStatus;
  grandTotal: Money;
  paymentStatus: PaymentStatus | null;
  fulfillmentStatus: FulfillmentStatus | null;
  placedAt: string;
};

export type AdminCustomerDetail = AdminCustomerSummary & {
  deactivatedAt: string | null;
  addresses: AdminCustomerAddress[];
  notes: AdminCustomerNote[];
  recentOrders: AdminCustomerOrder[];
};

export type AdminCustomerListResponse = ApiSuccess<{
  items: AdminCustomerSummary[];
  meta: OrderListMeta;
}>;

export type AdminCustomerDetailResponse = ApiSuccess<{ customer: AdminCustomerDetail }>;

export type AdminCustomerAuditEntry = {
  id: string;
  action: string;
  actorId: string | null;
  createdAt: string;
};

export type AdminCustomerAuditResponse = ApiSuccess<{
  items: AdminCustomerAuditEntry[];
  meta: OrderListMeta;
}>;

export type AdminCustomerCreateRequest = {
  mobile: string;
  firstName?: string | null;
  lastName?: string | null;
};

export type AdminCustomerUpdateRequest = {
  expectedVersion: number;
  firstName?: string | null;
  lastName?: string | null;
};

/**
 * Full replacement of the address set. Addresses are staff-maintained
 * convenience data, never order history, so the set is replaced atomically
 * rather than diffed. Deactivation is expressed here so a customer can be
 * archived in the same audited command.
 */
export type AdminCustomerAddressesRequest = {
  expectedVersion: number;
  addresses: Array<{
    label: string;
    receiverName: string;
    mobile: string;
    provinceCode: string;
    city: string;
    addressLine: string;
    postalCode?: string | null;
    isDefault?: boolean;
  }>;
  /** Set false to deactivate; true to reactivate a deactivated customer. */
  status?: CustomerStatus;
};

export type AdminCustomerNoteRequest = {
  expectedVersion: number;
  visibility: CustomerNoteVisibility;
  body: string;
};
