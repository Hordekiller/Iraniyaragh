import type { ApiSuccess, Money } from './index';

/**
 * Operationally configurable platform settings (ADR-0014, G1). Each setting is a
 * DB-backed key/value pair (`Setting` model) with optimistic concurrency and full
 * audit. The typed snapshots below are the public contract; isSecret values are
 * never returned in full.
 */

/** Integer basis points (100 bp = 1 %). Used for rates and fractions. */
export type BasisPoints = number;

/** How the shop price relates to collected VAT (Iranian VAT Law 1400, Art. 5). */
export type VatTreatment = 'EXCLUSIVE' | 'INCLUSIVE';

/**
 * Rounding is fixed to ROUND_HALF_UP to whole Rials per ADR-0003 and is not
 * operator-selectable; the union keeps the value explicit in the contract.
 */
export type RoundingMethod = 'ROUND_HALF_UP';

/**
 * Financial policy settings (group `financial`). Defaults reflect the 1404
 * budget-law standard rate (10 % = 1000 bp) and EC Law Art. 37/38 withdrawal
 * rights; every monetary value is integer Rials (ADR-0003).
 */
export type FinancialPolicySettings = {
  /** VAT rate in basis points; presets 0/900/1000/1200/1600. Default 1000. */
  vatRateBp: BasisPoints;
  /** Whether the displayed shop price includes VAT (EC Law Art. 33 disclosure). */
  vatTreatment: VatTreatment;
  /** Locked rounding method per ADR-0003. */
  roundingMethod: RoundingMethod;
  /** Maximum per-order discount in basis points of the pre-discount subtotal. */
  maxDiscountOrderBp: BasisPoints;
  /** A second opinion (approver) is required for discounts above this Rial amount. */
  discountApprovalThreshold: Money;
  /** Refunds at or below this amount are auto-approved; above requires an approver. */
  refundAutoMax: Money;
  /** Maximum refundable fraction of a paid amount in basis points (1-10000). */
  refundMaxFractionBp: BasisPoints;
  /**
   * Distance-contract withdrawal window in working days; the legal floor is 7
   * (Iran EC Law Art. 37) and the UI/API must never allow a lower value.
   */
  withdrawalWindowDays: number;
};

/** Seller legal disclosure block (group `legal`), e-Namad slot (EC Law Art. 33). */
export type SellerLegalBlockSettings = {
  /** Registered business/trade legal name. */
  legalName: string;
  /** Iranian national ID (شناسه ملی) when the seller is a real/legal person. */
  nationalId: string | null;
  /** Economic code (کد اقتصادی) for VAT/e-invoice purposes. */
  economicCode: string | null;
  /** Business address. */
  address: string | null;
  /** Public contact email shown to consumers. */
  contactEmail: string | null;
  /** Public contact phone shown to consumers. */
  contactPhone: string | null;
  /** e-Namad trust-seal URL when issued (نماد اعتماد الکترونیکی). */
  eNamadUrl: string | null;
  /** Withdrawal/return rights text presented to consumers (EC Law Art. 37-38). */
  withdrawalPolicyText: string | null;
};

/** A single settings entry as returned by the admin API. */
export type SettingSnapshot<T> = {
  key: string;
  group: string;
  description: string;
  /** Secret values are reported as masked status only; `value` is then omitted. */
  isSecret: boolean;
  version: number;
  updatedAt: string | null;
  value: T;
};

export type SettingsAdminSnapshot = {
  financialPolicy: SettingSnapshot<FinancialPolicySettings>;
  sellerLegalBlock: SettingSnapshot<SellerLegalBlockSettings>;
};

export type SettingsAdminSnapshotResponse = ApiSuccess<{
  settings: SettingsAdminSnapshot;
}>;

export type SettingsUpdatePayload<T> = {
  expectedVersion: number;
  value: T;
};

export type FinancialPolicySettingsUpdateResponse = ApiSuccess<{
  settings: { financialPolicy: SettingSnapshot<FinancialPolicySettings> };
}>;

export type SellerLegalBlockUpdateResponse = ApiSuccess<{
  settings: { sellerLegalBlock: SettingSnapshot<SellerLegalBlockSettings> };
}>;

/** How a financial-policy setting value is written through the DTO boundary. */
export type FinancialPolicySettingsUpdateRequest =
  SettingsUpdatePayload<FinancialPolicySettings>;

export type SellerLegalBlockUpdateRequest =
  SettingsUpdatePayload<SellerLegalBlockSettings>;