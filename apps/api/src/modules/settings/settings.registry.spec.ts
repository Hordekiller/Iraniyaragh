import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FINANCIAL_POLICY,
  SETTING_KEYS,
  SETTING_METADATA,
} from './settings.registry';

describe('settings registry', () => {
  it('carries the 1404 budget-law VAT default (10 % = 1000 bp, exclusive)', () => {
    expect(DEFAULT_FINANCIAL_POLICY.vatRateBp).toBe(1000);
    expect(DEFAULT_FINANCIAL_POLICY.vatTreatment).toBe('EXCLUSIVE');
  });

  it('keeps rounding locked to ROUND_HALF_UP per ADR-0003', () => {
    expect(DEFAULT_FINANCIAL_POLICY.roundingMethod).toBe('ROUND_HALF_UP');
  });

  it('never drops below the 7-working-day withdrawal legal floor', () => {
    expect(DEFAULT_FINANCIAL_POLICY.withdrawalWindowDays).toBeGreaterThanOrEqual(7);
  });

  it('describes every registered key with metadata', () => {
    expect(Object.keys(SETTING_KEYS)).toHaveLength(2);
    expect(SETTING_METADATA[SETTING_KEYS.financialPolicy].group).toBe('financial');
    expect(SETTING_METADATA[SETTING_KEYS.sellerLegalBlock].group).toBe('legal');
    expect(SETTING_METADATA[SETTING_KEYS.financialPolicy].isSecret).toBe(false);
  });

  it('keeps money defaults as integer-Rial strings (ADR-0003)', () => {
    expect(DEFAULT_FINANCIAL_POLICY.discountApprovalThreshold.amount).toMatch(/^\d+$/u);
    expect(DEFAULT_FINANCIAL_POLICY.refundAutoMax.currency).toBe('IRR');
  });
});