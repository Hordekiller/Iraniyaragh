export const INVENTORY_PERMISSIONS = [
  'inventory.read',
  'inventory.adjust',
  'inventory.transfer',
  'inventory.approve',
] as const;

export type InventoryPermission = (typeof INVENTORY_PERMISSIONS)[number];

export type PublicAvailabilityStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
export type PublicVariantAvailability = { variantId: string; status: PublicAvailabilityStatus };
export type PublicAvailabilityResponse = { items: PublicVariantAvailability[] };

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

export type WarehouseListResponse = {
  items: Warehouse[];
  count: number;
};

export type WarehouseResponse = Warehouse;

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

export type WarehouseLocationListResponse = {
  items: WarehouseLocation[];
  count: number;
};

export type WarehouseLocationResponse = WarehouseLocation;

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

export type ReservationListResponse = {
  items: Reservation[];
  count: number;
};

export type ReservationResponse = Reservation;

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

export type TransferListResponse = {
  items: StockTransfer[];
  count: number;
};

export type TransferResponse = StockTransfer;
