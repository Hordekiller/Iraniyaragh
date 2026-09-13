import { plainToInstance } from 'class-transformer';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Prisma } from '@prisma/client';
import { FinancialPolicyValueDto, SellerLegalBlockValueDto } from './settings.dto';
import { SettingsService } from './settings.service';

function financialPolicy(overrides: Partial<FinancialPolicyValueDto> = {}): FinancialPolicyValueDto {
  return plainToInstance(FinancialPolicyValueDto, {
    vatRateBp: 1000,
    vatTreatment: 'EXCLUSIVE' as const,
    roundingMethod: 'ROUND_HALF_UP' as const,
    maxDiscountOrderBp: 5000,
    discountApprovalThreshold: { amount: '5000000', currency: 'IRR' },
    refundAutoMax: { amount: '1000000', currency: 'IRR' },
    refundMaxFractionBp: 10000,
    withdrawalWindowDays: 7,
    ...overrides,
  });
}

function sellerLegal(overrides: Partial<SellerLegalBlockValueDto> = {}): SellerLegalBlockValueDto {
  return plainToInstance(SellerLegalBlockValueDto, {
    legalName: 'Iraniyaragh Bookstore',
    ...overrides,
  });
}

function row(overrides: Partial<{ version: number; updatedAt: Date; updatedById: string | null; value: Prisma.JsonValue }> = {}) {
  return {
    key: 'financialPolicy',
    value: null,
    version: 0,
    updatedAt: new Date('2026-09-13T00:00:00.000Z'),
    updatedById: null,
    ...overrides,
  };
}

function fakePrisma(settingRows: Array<ReturnType<typeof row>> = []) {
  return {
    setting: {
      findMany: vi.fn(async () => settingRows),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        settingRows.find((r) => r.key === where.key) ?? null,
      ),
      upsert: vi.fn(async ({ update, create }: { update: unknown; create: unknown }) => ({
        key: (create as { key: string }).key,
        value: (create as { value: unknown }).value ?? (update as { value: unknown }).value,
        version: (create as { version: number }).version ?? (update as { version: number }).version,
        updatedAt: new Date('2026-09-13T01:00:00.000Z'),
        updatedById: (create as { updatedById?: string | null }).updatedById ?? null,
      })),
    },
  };
}

const ctx = { actorUserId: 'actor-1', requestId: 'req-1' };

describe('SettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the code defaults as version 0 when no rows exist', async () => {
    const prisma = fakePrisma();
    const audit = { record: vi.fn() };
    const service = new SettingsService(prisma as never, audit as never);

    const response = await service.getSnapshot();

    expect(prisma.setting.findMany).toHaveBeenCalledTimes(1);
    expect(response.data.settings.financialPolicy.version).toBe(0);
    expect(response.data.settings.financialPolicy.value.vatRateBp).toBe(1000);
    expect(response.data.settings.financialPolicy.value.vatTreatment).toBe('EXCLUSIVE');
    expect(response.data.settings.sellerLegalBlock.version).toBe(0);
    expect(response.data.settings.sellerLegalBlock.value.legalName).toBe('');
    expect(response.data.settings.financialPolicy.isSecret).toBe(false);
  });

  it('merges a stored row over the code defaults', async () => {
    const prisma = fakePrisma([row({ key: 'financialPolicy', version: 2 })]);
    prisma.setting.findMany.mockResolvedValue([
      row({ key: 'financialPolicy', version: 2, value: { vatRateBp: 900 } }),
    ]);
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    const response = await service.getSnapshot();

    expect(response.data.settings.financialPolicy.version).toBe(2);
    expect(response.data.settings.financialPolicy.value.vatRateBp).toBe(900);
    expect(response.data.settings.financialPolicy.value.withdrawalWindowDays).toBe(7);
  });

  it('writes an initial financial policy at version 1 and records audit', async () => {
    const prisma = fakePrisma();
    const audit = { record: vi.fn() };
    const service = new SettingsService(prisma as never, audit as never);

    const response = await service.updateFinancialPolicy(ctx, { expectedVersion: 0, value: financialPolicy() });

    expect(prisma.setting.upsert).toHaveBeenCalledTimes(1);
    const created = (prisma.setting.upsert.mock.calls[0][0] as { create: { version: number } }).create;
    expect(created.version).toBe(1);
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(response.data.settings.financialPolicy.version).toBe(1);
  });

  it('increments the version on a subsequent update', async () => {
    const stored = row({ key: 'financialPolicy', version: 3, value: { vatRateBp: 900 } });
    const prisma = fakePrisma([stored]);
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    const response = await service.updateFinancialPolicy(ctx, {
      expectedVersion: 3,
      value: financialPolicy({ vatRateBp: 1000 }),
    });

    expect(response.data.settings.financialPolicy.version).toBe(4);
  });

  it('rejects an optimistic-concurrency conflict with a 409 code', async () => {
    const stored = row({ key: 'financialPolicy', version: 2 });
    const prisma = fakePrisma([stored]);
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    await expect(
      service.updateFinancialPolicy(ctx, { expectedVersion: 1, value: financialPolicy() }),
    ).rejects.toMatchObject({ response: { code: 'CONFLICT' } });
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('rejects a withdrawal window below the legal floor before writing', async () => {
    const prisma = fakePrisma();
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    await expect(
      service.updateFinancialPolicy(ctx, {
        expectedVersion: 0,
        value: financialPolicy({ withdrawalWindowDays: 6 }),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('rejects a non-locked rounding method even if it passed the DTO', async () => {
    const service = new SettingsService(fakePrisma() as never, { record: vi.fn() } as never);

    await expect(
      service.updateFinancialPolicy(ctx, {
        expectedVersion: 0,
        value: financialPolicy({ roundingMethod: 'ROUND_UP' as 'ROUND_HALF_UP' }),
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('updates the seller legal block with optimistic concurrency and audit', async () => {
    const stored = row({ key: 'sellerLegalBlock', version: 1, value: { legalName: 'Old' } });
    const prisma = fakePrisma([stored]);
    const audit = { record: vi.fn() };
    const service = new SettingsService(prisma as never, audit as never);

    const response = await service.updateSellerLegalBlock(ctx, {
      expectedVersion: 1,
      value: sellerLegal({ legalName: 'Iraniyaragh Bookstore' }),
    });

    expect(response.data.settings.sellerLegalBlock.version).toBe(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('rejects an optimistic-concurrency conflict on the seller legal block', async () => {
    const stored = row({ key: 'sellerLegalBlock', version: 5 });
    const prisma = fakePrisma([stored]);
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    await expect(
      service.updateSellerLegalBlock(ctx, { expectedVersion: 4, value: sellerLegal() }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('strips no secret values from the public snapshot (isSecret metadata is truthful on writes)', async () => {
    const prisma = fakePrisma();
    const service = new SettingsService(prisma as never, { record: vi.fn() } as never);

    await service.updateFinancialPolicy(ctx, { expectedVersion: 0, value: financialPolicy() });

    const upsertArg = prisma.setting.upsert.mock.calls[0][0] as { create: { isSecret: boolean } };
    expect(upsertArg.create.isSecret).toBe(false);
  });
});