import type { ApiSuccess } from './api';

export type InventoryCostMethod = 'FIFO' | 'MOVING_WEIGHTED_AVERAGE';
export type InventoryCostPolicy = {
  id: string;
  version: number;
  method: InventoryCostMethod | null;
  createdAt: string;
};
export type InventoryCostPolicyUpdate = {
  method: InventoryCostMethod | null;
  expectedVersion: number | null;
  reason: string;
};
export type InventoryCostPolicyState = {
  policy: InventoryCostPolicy | null;
  valuationEnabled: false;
  activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED';
  missingCostTreatment: 'REQUIRE_EVIDENCE';
};
export type InventoryCostPolicyResponse = ApiSuccess<InventoryCostPolicyState>;
