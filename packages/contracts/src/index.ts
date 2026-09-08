export type Money = { amount: string; currency: 'IRR' };

export * from './api';
export * from './auth';
export * from './catalog';
export * from './sms-settings';

export type InventorySnapshot = {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
};
