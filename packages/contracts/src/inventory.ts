import type { ApiSuccess } from './api';

export const INVENTORY_PERMISSIONS = [
  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.approve',
] as const;

export type InventoryPermission = (typeof INVENTORY_PERMISSIONS)[number];

export type WarehouseStatus = 'ACTIVE' | 'INACTIVE';

export type Warehouse = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseListResponse = ApiSuccess<{
  items: Warehouse[];
  count: number;
}>;

export type WarehouseResponse = ApiSuccess<{ warehouse: Warehouse }>;

export type WarehouseLocation = {
  id: string;
  warehouseId: string;
  code: string;
  name: string | null;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WarehouseLocationListResponse = ApiSuccess<{
  items: WarehouseLocation[];
  count: number;
}>;

export type WarehouseLocationResponse = ApiSuccess<{ location: WarehouseLocation }>;

export type ReservationStatus = 'ACTIVE' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';

export type Reservation = {
  id: string;
  warehouseId: string;
  locationId: string;
  variantId: string;
  orderId: string | null;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ReservationListResponse = ApiSuccess<{
  items: Reservation[];
  count: number;
}>;

export type ReservationResponse = ApiSuccess<{ reservation: Reservation }>;

export type TransferStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

export type TransferItem = {
  id: string;
  variantId: string;
  quantity: number;
  sourceLocationId: string | null;
  targetLocationId: string | null;
};

export type StockTransfer = {
  id: string;
  code: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  status: TransferStatus;
  items: TransferItem[];
  createdAt: string;
  updatedAt: string;
};

export type TransferListResponse = ApiSuccess<{
  items: StockTransfer[];
  count: number;
}>;

export type TransferResponse = ApiSuccess<{ transfer: StockTransfer }>;