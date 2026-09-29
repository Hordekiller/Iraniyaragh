export type PurchaseOrderStatus = 'DRAFT' | 'APPROVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';

export type PurchaseOrderLine = {
  id: string;
  variantId: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: string;
  lineCost: string;
};

export type PurchaseOrder = {
  id: string;
  number: string;
  supplierId: string;
  warehouseId: string;
  status: PurchaseOrderStatus;
  version: number;
  expectedAt: string | null;
  notes: string | null;
  items: PurchaseOrderLine[];
  totalCost: string;
  createdAt: string;
  updatedAt: string;
};

export type PurchaseOrderListResponse = { items: PurchaseOrder[]; count: number };
export type PurchaseOrderOptionKind = 'supplier' | 'warehouse' | 'variant';
export type PurchaseOrderOption = { id: string; code: string; label: string };
export type PurchaseOrderOptionsResponse = { items: PurchaseOrderOption[]; count: number };
export type PurchaseOrderItemInput = { variantId: string; orderedQty: number; unitCost: string };
export type PurchaseOrderCreateRequest = {
  supplierId: string;
  warehouseId: string;
  expectedAt?: string | null;
  notes?: string | null;
  items: PurchaseOrderItemInput[];
};
export type PurchaseOrderUpdateRequest = {
  expectedVersion: number;
  expectedAt?: string | null;
  notes?: string | null;
  items?: PurchaseOrderItemInput[];
};
export type PurchaseOrderActionRequest = { expectedVersion: number };
export type PurchaseOrderAuditEntry = { id: string; action: string; actorId: string | null; createdAt: string };
export type PurchaseOrderAuditResponse = { items: PurchaseOrderAuditEntry[]; count: number };

export type PurchaseReceiptLineInput = { variantId: string; locationId: string; quantity: number };
export type PurchaseReceiptCreateRequest = { expectedVersion: number; externalReference: string; lines: PurchaseReceiptLineInput[] };
export type PurchaseReceiptLine = PurchaseReceiptLineInput & { id: string; purchaseOrderItemId: string; movementId: string };
export type PurchaseReceipt = {
  id: string; number: string; purchaseOrderId: string; warehouseId: string;
  externalReference: string; actorId: string; receivedAt: string; lines: PurchaseReceiptLine[];
};
export type PurchaseReceiptListResponse = { items: PurchaseReceipt[]; count: number };
