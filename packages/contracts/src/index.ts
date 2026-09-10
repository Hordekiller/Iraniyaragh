export type Money = { amount: string; currency: 'IRR' };

export * from './api';
export * from './auth';
export * from './catalog';
export * from './notifications-sms';

export type InventorySnapshot = {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
};
