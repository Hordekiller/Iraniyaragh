import type {
  AdminOrderDetail,
  AdminOrderSummary,
  FulfillmentStatus,
  OrderListMeta,
  OrderStatus,
  PaymentStatus,
} from '@iranyaragh/contracts';

export type {
  AdminOrderDetail,
  AdminOrderSummary,
  FulfillmentStatus as AdminFulfillmentStatus,
  OrderListMeta as AdminOrderMeta,
  OrderStatus as AdminOrderStatus,
  PaymentStatus as AdminPaymentStatus,
};

export type AdminOrderQuery = {
  page?: number;
  perPage?: number;
  search?: string;
  orderStatus?: OrderStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentStatus?: FulfillmentStatus;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'grandTotal';
  sortDir?: 'asc' | 'desc';
};

export type AdminOrderListResult = {
  items: AdminOrderSummary[];
  meta: OrderListMeta;
};

export interface AdminOrdersApi {
  listOrders(query: AdminOrderQuery, signal?: AbortSignal): Promise<AdminOrderListResult>;
  getOrder(id: string, signal?: AbortSignal): Promise<AdminOrderDetail>;
}
