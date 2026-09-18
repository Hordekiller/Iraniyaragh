export type Money = { amount: string; currency: 'IRR' };

export * from './api';
export * from './auth';
export * from './catalog';
export * from './cart';
export * from './media';
export * from './inventory';
export * from './notifications-sms';
export * from './orders';

export type InventorySnapshot = {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
};
