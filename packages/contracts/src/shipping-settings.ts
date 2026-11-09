import type { ApiSuccess, Money } from './index';

import type { ReturnWindowKind } from './returns';

export type ShippingMethodSettings = {
  code: string;
  title: string;
  amount: Money;
  isActive: boolean;
  /** Return window class of this method; null until staff classify it (returns stay blocked). */
  returnWindowKind: ReturnWindowKind | null;
  version: number;
  policyRevision: string;
  updatedAt: string;
};
export type ShippingMethodSettingsUpdate = {
  title: string;
  amount: Money;
  isActive: boolean;
  /** Omit to leave the current classification unchanged. */
  returnWindowKind?: ReturnWindowKind | null;
  expectedVersion: number | null;
};
export type ShippingMethodSettingsListResponse = ApiSuccess<{ items: ShippingMethodSettings[] }>;
export type ShippingMethodSettingsResponse = ApiSuccess<{ method: ShippingMethodSettings }>;
