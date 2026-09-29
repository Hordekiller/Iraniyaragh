import type {
  AdminShipmentDetail,
  AdminShipmentEvent,
  AdminShipmentEventKind,
  AdminShipmentSummary,
  FulfillmentStatus,
  OrderListMeta,
} from '@iranyaragh/contracts';

export type {
  AdminShipmentDetail,
  AdminShipmentEvent,
  AdminShipmentEventKind,
  AdminShipmentSummary,
  FulfillmentStatus as AdminShipmentStatus,
  OrderListMeta as AdminShipmentMeta,
};

/**
 * Only post-dispatch states can appear on a persisted shipment row, mirroring
 * the API-side `SHIPMENT_STATUS_VALUES` filter contract.
 */
export const SHIPMENT_STATUSES = ['SHIPPED', 'DELIVERED', 'RETURNED'] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export type AdminShipmentQuery = {
  page?: number;
  perPage?: number;
  status?: ShipmentStatus;
  carrier?: string;
  trackingCode?: string;
  dispatchedFrom?: string;
  dispatchedTo?: string;
  sortBy?: 'dispatchedAt' | 'orderNumber' | 'carrier';
  sortDir?: 'asc' | 'desc';
};

export type AdminShipmentListResult = {
  items: AdminShipmentSummary[];
  meta: OrderListMeta;
};

export interface AdminShipmentsApi {
  listShipments(query: AdminShipmentQuery, signal?: AbortSignal): Promise<AdminShipmentListResult>;
  getShipment(id: string, signal?: AbortSignal): Promise<AdminShipmentDetail>;
}
