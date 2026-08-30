export type Money = { amount: string; currency: 'IRR' };

export type ApiSuccess<T> = { success: true; data: T; meta?: Record<string, unknown> };
export type ApiFailure = {
  success: false;
  error: { code: string; message: string; details?: Record<string, unknown> };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type InventorySnapshot = {
  warehouseId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
};
