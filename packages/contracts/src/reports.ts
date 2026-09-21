import type { ApiSuccess } from './api';
import type { ReservationStatus, TransferStatus } from './inventory';
import type { FulfillmentStatus, OrderStatus, PaymentStatus } from './orders';
import type { Money } from './index';

export type AdminDashboardQuery = {
  /** Inclusive UTC instant. */
  createdFrom: string;
  /** Exclusive UTC instant. */
  createdToExclusive: string;
};

export type DashboardStatusCount<TStatus extends string> = {
  status: TStatus;
  count: number;
};

export type AdminDashboardSummary = {
  /** Time at which the database snapshot was requested. */
  generatedAt: string;
  presentationTimezone: 'Asia/Tehran';
  range: {
    createdFrom: string;
    createdToExclusive: string;
  };
  rangeMetrics: {
    ordersCreated: number;
    grossOrderValue: Money;
  };
  commerceSnapshot: {
    ordersByStatus: DashboardStatusCount<OrderStatus>[];
    paymentAttemptsByStatus: DashboardStatusCount<PaymentStatus>[];
    fulfillmentsByStatus: DashboardStatusCount<FulfillmentStatus>[];
    ordersWithoutPaymentAttempts: number;
    ordersWithoutFulfillment: number;
  };
  inventorySnapshot: {
    zeroAvailableBalances: number;
    activeReservations: number;
    reservationsByStatus: DashboardStatusCount<ReservationStatus>[];
    transfersByStatus: DashboardStatusCount<TransferStatus>[];
  };
};

export type AdminDashboardResponse = ApiSuccess<{
  summary: AdminDashboardSummary;
}>;
