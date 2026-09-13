import type {
  FinancialPolicySettings,
  SellerLegalBlockSettings,
} from '@iranyaragh/contracts';

/** Canonical operating defaults for the configurable settings store (ADR-0014 G1). */
export const DEFAULT_FINANCIAL_POLICY: FinancialPolicySettings = {
  vatRateBp: 1000,
  vatTreatment: 'EXCLUSIVE',
  roundingMethod: 'ROUND_HALF_UP',
  maxDiscountOrderBp: 5000,
  discountApprovalThreshold: { amount: '5000000', currency: 'IRR' },
  refundAutoMax: { amount: '1000000', currency: 'IRR' },
  refundMaxFractionBp: 10000,
  withdrawalWindowDays: 7,
};

export const DEFAULT_SELLER_LEGAL_BLOCK: SellerLegalBlockSettings = {
  legalName: '',
  nationalId: null,
  economicCode: null,
  address: null,
  contactEmail: null,
  contactPhone: null,
  eNamadUrl: null,
  withdrawalPolicyText: null,
};

export const SETTING_KEYS = {
  financialPolicy: 'financialPolicy',
  sellerLegalBlock: 'sellerLegalBlock',
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

export const SETTING_METADATA: Record<
  SettingKey,
  { group: string; description: string; isSecret: boolean }
> = {
  [SETTING_KEYS.financialPolicy]: {
    group: 'financial',
    description:
      'VAT rate and treatment, rounding, discount limits, approval thresholds and withdrawal window (ADR-0014).',
    isSecret: false,
  },
  [SETTING_KEYS.sellerLegalBlock]: {
    group: 'legal',
    description:
      'Seller legal disclosure block and e-Namad slot shown to consumers (Iran EC Law Art. 33).',
    isSecret: false,
  },
};