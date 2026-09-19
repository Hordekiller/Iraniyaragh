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

export const INVENTORY_MOVEMENT_TYPES = [
  'RECEIPT',
  'SALE',
  'RETURN_IN',
  'RETURN_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'STOCKTAKE',
  'RESERVATION',
  'RELEASE',
] as const;

export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export type InventoryPageQuery = {
  warehouseId?: string;
  locationId?: string;
  variantId?: string;
  offset?: number;
  limit?: number;
};

export type InventoryMovementQuery = InventoryPageQuery & {
  type?: InventoryMovementType;
};

export type InventoryBalanceSnapshot = {
  warehouseId: string;
  locationId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
};

export type InventoryBalanceListResponse = {
  items: InventoryBalanceSnapshot[];
  count: number;
};

/** Sanitized HTTP projection; persistence-only replay keys are never exposed. */
export type InventoryMovement = {
  id: string;
  warehouseId: string;
  locationId: string;
  variantId: string;
  type: InventoryMovementType;
  quantity: number;
  beforeOnHand: number;
  afterOnHand: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
};

export type InventoryMovementListResponse = {
  items: InventoryMovement[];
  count: number;
};

export type InventoryChangeRequest = {
  warehouseId: string;
  locationId: string;
  variantId: string;
  delta: number;
  type: InventoryMovementType;
  reason?: string;
  referenceType?: string;
  referenceId?: string;
  expectedVersion?: number;
};

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

export type WarehouseCreateRequest = {
  code: string;
  name: string;
  city?: string;
  address?: string;
};

export type WarehouseUpdateRequest = {
  name?: string;
  city?: string;
  address?: string;
  isActive?: boolean;
};

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

export type WarehouseLocationCreateRequest = {
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
};

export type WarehouseLocationUpdateRequest = Omit<WarehouseLocationCreateRequest, 'code'> & {
  isActive?: boolean;
};

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

export type ReservationCreateRequest = {
  warehouseId: string;
  locationId: string;
  variantId: string;
  orderId?: string;
  quantity: number;
  expiresAt: string;
  expectedVersion?: number;
};

export type InventoryLifecycleRequest = {
  expectedVersion?: number;
};

export type TransferStatus = 'DRAFT' | 'REQUESTED' | 'APPROVED' | 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';

/** Upper bound for one operator-created transfer command. */
export const MAX_TRANSFER_ITEMS = 100;

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
  version: number;
  items: TransferItem[];
  createdAt: string;
  updatedAt: string;
};

export type TransferListResponse = {
  items: StockTransfer[];
  count: number;
};

export type TransferResponse = StockTransfer;

export type TransferItemCreateRequest = {
  variantId: string;
  quantity: number;
  sourceLocationId?: string;
  targetLocationId?: string;
};

export type TransferCreateRequest = {
  code?: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  items: TransferItemCreateRequest[];
};

/** Optimistic version of the transfer aggregate, not an inventory-balance version. */
export type TransferActionRequest = {
  expectedVersion?: number;
};
