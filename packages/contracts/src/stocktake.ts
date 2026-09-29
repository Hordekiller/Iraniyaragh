export type StocktakeStatus = 'DRAFT' | 'COUNTING' | 'REVIEW' | 'COMPLETED' | 'CANCELLED';

export type StocktakeScopeType = 'WAREHOUSE' | 'LOCATIONS' | 'VARIANTS';

export type StocktakeLineInput = {
  locationId: string;
  variantId: string;
  countedQty: number;
  notes?: string | null;
};

/**
 * `expectedQty` and `difference` are omitted for principals without
 * `stocktake.approve` so counting stays blind. `difference` stays null until
 * the line is counted.
 */
export type StocktakeLine = {
  id: string;
  locationId: string;
  locationCode: string;
  locationName: string | null;
  variantId: string;
  sku: string;
  productName: string;
  variantTitle: string | null;
  expectedQty?: number;
  countedQty: number | null;
  difference?: number | null;
  countedAt: string | null;
  notes: string | null;
  countedById: string | null;
  movementId: string | null;
};

export type StocktakeSummary = {
  totalLines: number;
  countedLines: number;
  pendingLines: number;
  /** Only present for principals holding `stocktake.approve`. */
  netDifference?: number;
};

export type Stocktake = {
  id: string;
  number: string;
  status: StocktakeStatus;
  version: number;
  warehouseId: string;
  warehouseCode: string;
  warehouseName: string;
  scopeType: StocktakeScopeType;
  notes: string | null;
  createdById: string;
  countedById: string | null;
  approvedById: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  summary: StocktakeSummary;
};

export type StocktakeDetail = Stocktake & { lines: StocktakeLine[] };

export type StocktakeListResponse = { items: Stocktake[]; count: number };

export type StocktakeLocationOption = { id: string; code: string; label: string };
export type StocktakeLocationOptionsResponse = { items: StocktakeLocationOption[]; count: number };

export type StocktakeVariantOption = { id: string; sku: string; label: string };
export type StocktakeVariantOptionsResponse = { items: StocktakeVariantOption[]; count: number };

export type StocktakeCreateRequest = {
  warehouseId: string;
  scopeType?: StocktakeScopeType;
  locationIds?: string[];
  variantIds?: string[];
  notes?: string | null;
};

export type StocktakeCountRequest = {
  expectedVersion: number;
  lines: StocktakeLineInput[];
};

export type StocktakeActionRequest = { expectedVersion: number };

export type StocktakeAuditEntry = {
  id: string;
  action: string;
  actorId: string | null;
  createdAt: string;
};

export type StocktakeAuditResponse = { items: StocktakeAuditEntry[]; count: number };
