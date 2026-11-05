import type { ApiSuccess } from './api';
import type { Money } from './index';

export type PromotionKind = 'PERCENTAGE' | 'FIXED_CART' | 'FIXED_ITEM' | 'FREE_SHIPPING';
export type PromotionMode = 'COUPON' | 'AUTOMATIC';
export type PromotionTargetType = 'PRODUCT' | 'VARIANT' | 'CATEGORY' | 'BRAND';
export type PromotionState = 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'EXHAUSTED';
export type PromotionRedemptionStatus = 'RESERVED' | 'CONFIRMED' | 'RELEASED' | 'REFUNDED';

export type CouponErrorCode =
  | 'COUPON_NOT_FOUND'
  | 'COUPON_INACTIVE'
  | 'COUPON_NOT_STARTED'
  | 'COUPON_EXPIRED'
  | 'COUPON_EXHAUSTED'
  | 'COUPON_CUSTOMER_LIMIT'
  | 'COUPON_NOT_ELIGIBLE'
  | 'COUPON_NOT_APPLICABLE';

export type CartPromotionLine = {
  promotionId: string;
  name: string;
  kind: PromotionKind;
  discount: Money;
  shippingDiscount: Money;
};

/** Trusted, server-computed discount breakdown for the cart. */
export type CartPromotionView = {
  couponCode: string | null;
  couponError: { code: CouponErrorCode; message: string } | null;
  applied: CartPromotionLine[];
  itemDiscount: Money;
  /** Shipping discount depends on the chosen method; only known at checkout. */
  payable: Money;
};

export type ApplyCouponRequest = { code: string };

export type PromotionTarget = { type: PromotionTargetType; targetId: string; exclude: boolean; label?: string | null };

export type PromotionInput = {
  name: string;
  description: string | null;
  badgeText: string | null;
  kind: PromotionKind;
  mode: PromotionMode;
  percentBp: number | null;
  amount: string | null;
  maxDiscount: string | null;
  minOrder: string | null;
  maxOrder: string | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  perCustomerLimit: number | null;
  firstPurchaseOnly: boolean;
  customerId: string | null;
  stackable: boolean;
  priority: number;
  targets: PromotionTarget[];
};

export type PromotionStats = {
  reserved: number;
  confirmed: number;
  released: number;
  refunded: number;
  discountConfirmed: Money;
  discountRefunded: Money;
  salesAttributed: Money;
};

export type PromotionAdmin = PromotionInput & {
  id: string;
  isActive: boolean;
  state: PromotionState;
  usedCount: number;
  couponCount: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  stats: PromotionStats;
};

export type CouponAdmin = {
  id: string;
  promotionId: string;
  code: string;
  isActive: boolean;
  maxRedemptions: number | null;
  usedCount: number;
  customerId: string | null;
  createdAt: string;
};

export type PromotionRedemptionRow = {
  id: string;
  promotionId: string;
  promotionName: string;
  couponCode: string | null;
  orderId: string;
  orderNumber: string;
  customerId: string;
  status: PromotionRedemptionStatus;
  discount: Money;
  shippingDiscount: Money;
  refundedDiscount: Money;
  orderTotal: Money;
  reservedAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  releaseReason: string | null;
};

export type PromotionListResponse = ApiSuccess<{ items: PromotionAdmin[]; total: number }>;
export type PromotionResponse = ApiSuccess<{ promotion: PromotionAdmin }>;
export type CouponListResponse = ApiSuccess<{ items: CouponAdmin[]; total: number }>;
export type CouponGenerateRequest = {
  /** Explicit code, or omit and set `count` to generate random codes. */
  code?: string;
  count?: number;
  maxRedemptions: number | null;
  customerId: string | null;
};
export type CouponGenerateResponse = ApiSuccess<{ items: CouponAdmin[] }>;
export type PromotionRedemptionListResponse = ApiSuccess<{ items: PromotionRedemptionRow[]; total: number }>;

export type PromotionReportRow = {
  promotionId: string;
  name: string;
  state: PromotionState;
  stats: PromotionStats;
};
export type PromotionReportResponse = ApiSuccess<{ items: PromotionReportRow[] }>;

/** Public, truthful campaign badge for storefront product cards. */
export type PublicPromotion = {
  id: string;
  name: string;
  badgeText: string | null;
  kind: PromotionKind;
  percentBp: number | null;
  amount: string | null;
  startsAt: string | null;
  endsAt: string | null;
  scheduled: boolean;
  /**
   * Server-resolved product scope (brand, category incl. subcategories, SKU and exclusions already applied;
   * a product is listed only when every sellable variant of it is eligible). Internal rules are never exposed.
   */
  scope: { all: true; exceptProductIds: string[] } | { all: false; productIds: string[] };
};
export type PublicPromotionListResponse = ApiSuccess<{ items: PublicPromotion[] }>;
