/**
 * Admin order view types (read queue + detail).
 *
 * The authoritative domain/contract types for orders live in
 * `@iranyaragh/contracts` once the order API lands (issue backlog). Until then
 * this module declares the slim view model the admin renders, mirroring the
 * accepted domain guide (docs/COMMERCE_AND_INVENTORY.md): the three lifecycles —
 * order, payment and fulfillment — are separate and must NEVER be flattened
 * into one status field (docs/ADMIN_PANEL_PLAN.md §5.4).
 *
 * Amounts are integer Rial, matching the storefront order model; display
 * conversions into Toman/presentation stay in `orders-labels.ts`.
 */

export type AdminOrderStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'CANCELLED';

export type AdminPaymentStatus =
  | 'UNPAID'
  | 'PENDING'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED';

export type AdminFulfillmentStatus =
  | 'UNFULFILLED'
  | 'ALLOCATED'
  | 'PICKING'
  | 'PACKED'
  | 'SHIPPED'
  | 'DELIVERED';

/** The three separated order-state machines, displayed as three badges. */
export type AdminOrderState = {
  orderStatus: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus;
  fulfillmentStatus: AdminFulfillmentStatus;
};

export type AdminOrderCustomer = {
  fullName: string;
  mobile: string;
};

export type AdminOrderSummary = {
  id: string;
  orderNumber: string;
  createdAt: string;
  updatedAt: string;
  customer: AdminOrderCustomer;
  totalRials: number;
} & AdminOrderState;

export type AdminOrderLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPriceRials: number;
  lineTotalRials: number;
};

export type AdminOrderDetail = AdminOrderSummary & {
  subtotalRials: number;
  shippingRials: number;
  shipping: {
    province: string;
    city: string;
    postalCode: string;
    address: string;
  };
  lines: AdminOrderLine[];
};

export type AdminOrderQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  orderStatus?: AdminOrderStatus;
  paymentStatus?: AdminPaymentStatus;
  fulfillmentStatus?: AdminFulfillmentStatus;
  sortBy?: 'createdAt' | 'updatedAt' | 'totalRials';
  sortDir?: 'asc' | 'desc';
};

export type AdminOrderMeta = {
  page: number;
  perPage: number;
  total: number;
  pages: number;
};

export type AdminOrderListResult = {
  items: AdminOrderSummary[];
  meta: AdminOrderMeta;
};

/**
 * The order read port the admin UI depends on. In this pre-backend phase it is
 * implemented by a deterministic fixture (`OrdersFixtureApi`) so the queue and
 * detail journeys are complete and testable; the real HTTP client replaces the
 * fixture behind this same interface when the order API contract lands.
 */
export interface AdminOrdersApi {
  listOrders(query: AdminOrderQuery, signal?: AbortSignal): Promise<AdminOrderListResult>;
  getOrder(id: string, signal?: AbortSignal): Promise<AdminOrderDetail>;
}