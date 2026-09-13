import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { describe, expect, it } from 'vitest';
import {
  FinancialPolicySettingsUpdateDto,
  FinancialPolicyValueDto,
  MoneyDto,
  SellerLegalBlockUpdateDto,
} from './settings.dto';

function financialPolicy(overrides: Partial<FinancialPolicyValueDto> = {}): Partial<FinancialPolicyValueDto> {
  return {
    vatRateBp: 1000,
    vatTreatment: 'EXCLUSIVE' as const,
    roundingMethod: 'ROUND_HALF_UP' as const,
    maxDiscountOrderBp: 5000,
    discountApprovalThreshold: { amount: '5000000', currency: 'IRR' },
    refundAutoMax: { amount: '1000000', currency: 'IRR' },
    refundMaxFractionBp: 10000,
    withdrawalWindowDays: 7,
    ...overrides,
  };
}

describe('MoneyDto', () => {
  it('accepts canonical integer Rial and rejects unsupported currency', async () => {
    const ok = plainToInstance(MoneyDto, { amount: '1000000', currency: 'IRR' });
    const bad = plainToInstance(MoneyDto, { amount: '1000000', currency: 'USD' });
    const negative = plainToInstance(MoneyDto, { amount: '-1', currency: 'IRR' });

    await expect(validate(ok)).resolves.toHaveLength(0);
    await expect(validate(bad)).resolves.not.toHaveLength(0);
    await expect(validate(negative)).resolves.not.toHaveLength(0);
  });
});

describe('FinancialPolicySettingsUpdateDto', () => {
  it('accepts the full canonical financial policy', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      expectedVersion: 0,
      value: financialPolicy(),
    });
    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a VAT rate outside the law presets (never ad-hoc math)', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      expectedVersion: 0,
      value: financialPolicy({ vatRateBp: 950 }),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('rejects a withdrawal window below the 7-working-day legal floor', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      expectedVersion: 0,
      value: financialPolicy({ withdrawalWindowDays: 6 }),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('rejects rounding methods the platform does not implement', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      expectedVersion: 0,
      value: financialPolicy({ roundingMethod: 'ROUND_UP' as 'ROUND_HALF_UP' }),
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'value')).toBe(true);
  });

  it('rejects unknown patch fields like the ValidationPipe does', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      expectedVersion: 0,
      value: { ...financialPolicy(), vatRatePercent: 10 },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a missing expectedVersion', async () => {
    const dto = plainToInstance(FinancialPolicySettingsUpdateDto, {
      value: financialPolicy(),
    });
    await expect(validate(dto)).resolves.not.toHaveLength(0);
  });
});

describe('SellerLegalBlockUpdateDto', () => {
  it('accepts a minimal legal block and full optional fields', async () => {
    const minimal = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 0,
      value: { legalName: 'Iraniyaragh Bookstore' },
    });
    const full = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 1,
      value: {
        legalName: 'Iraniyaragh Bookstore',
        nationalId: '1234567890',
        economicCode: '411234567890',
        address: 'Tehran',
        contactEmail: 'shop@example.com',
        contactPhone: '+982100000000',
        eNamadUrl: 'https://enamad.ir/',
        withdrawalPolicyText: 'You may return any distance purchase within 7 working days.',
      },
    });
    await expect(validate(minimal)).resolves.toHaveLength(0);
    await expect(validate(full)).resolves.toHaveLength(0);
  });

  it('rejects an empty legal name, a malformed national id, phone and e-Namad url', async () => {
    const noName = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 0,
      value: { legalName: '' },
    });
    const badNationalId = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 0,
      value: { legalName: 'Company', nationalId: '123' },
    });
    const badPhone = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 0,
      value: { legalName: 'Company', contactPhone: 'not-a-phone' },
    });
    const badUrl = plainToInstance(SellerLegalBlockUpdateDto, {
      expectedVersion: 0,
      value: { legalName: 'Company', eNamadUrl: 'javascript:alert(1)' },
    });
    await expect(validate(noName)).resolves.not.toHaveLength(0);
    await expect(validate(badNationalId)).resolves.not.toHaveLength(0);
    await expect(validate(badPhone)).resolves.not.toHaveLength(0);
    await expect(validate(badUrl)).resolves.not.toHaveLength(0);
  });
});