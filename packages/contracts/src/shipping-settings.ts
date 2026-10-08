import type { ApiSuccess, Money } from './index';

export type ShippingMethodSettings = {
  code: string;
  title: string;
  amount: Money;
  isActive: boolean;
  version: number;
  policyRevision: string;
  updatedAt: string;
};
export type ShippingMethodSettingsUpdate = {
  title: string;
  amount: Money;
  isActive: boolean;
  expectedVersion: number | null;
};
export type ShippingMethodSettingsListResponse = ApiSuccess<{ items: ShippingMethodSettings[] }>;
export type ShippingMethodSettingsResponse = ApiSuccess<{ method: ShippingMethodSettings }>;
