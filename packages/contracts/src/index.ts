export type Money = { amount: string; currency: 'IRR' };

export * from './api';
export * from './auth';
export * from './catalog';
export * from './customers';
export * from './cart';
export * from './media';
export * from './inventory';
export * from './notifications-sms';
export * from './orders';
export * from './fulfillment';
export * from './payments';
export * from './reports';
export * from './audit';
export * from './shipments';
export * from './shipping-settings';
export * from './suppliers';
export * from './purchasing';
export * from './stocktake';

export type InventorySnapshot = {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
};

export * from './media';

export * from './credit';
export * from './invoice-policy';
export * from './inventory-cost-policy';
export * from './invoice-drafts';

export * from './invoice-documents';

export * from './operational-reports';
