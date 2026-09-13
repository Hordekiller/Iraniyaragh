import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  FinancialPolicySettings,
  FinancialPolicySettingsUpdateResponse,
  SellerLegalBlockSettings,
  SellerLegalBlockUpdateResponse,
  SettingSnapshot,
  SettingsAdminSnapshotResponse,
} from '@iranyaragh/contracts';
import type { FinancialPolicyValueDto, SellerLegalBlockValueDto } from './settings.dto';
import {
  DEFAULT_FINANCIAL_POLICY,
  DEFAULT_SELLER_LEGAL_BLOCK,
  SETTING_KEYS,
  SETTING_METADATA,
} from './settings.registry';
import { AuditLogService, type AuditEventInput } from '../audit/audit-log.service';
import { PrismaService } from '../../database/prisma.service';

type ActorAndRequest = { actorUserId: string; requestId: string };

type SettingRow = {
  key: string;
  value: Prisma.JsonValue;
  version: number;
  updatedAt: Date;
  updatedById: string | null;
};

function toFinancialPolicy(value: Prisma.JsonValue): FinancialPolicySettings {
  const stored = value as FinancialPolicySettings;
  return { ...DEFAULT_FINANCIAL_POLICY, ...stored };
}

function toSellerLegalBlock(value: Prisma.JsonValue): SellerLegalBlockSettings {
  const stored = value as SellerLegalBlockSettings;
  return { ...DEFAULT_SELLER_LEGAL_BLOCK, ...stored };
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async getSnapshot(): Promise<SettingsAdminSnapshotResponse> {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: [SETTING_KEYS.financialPolicy, SETTING_KEYS.sellerLegalBlock] } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const financialRow = byKey.get(SETTING_KEYS.financialPolicy);
    const legalRow = byKey.get(SETTING_KEYS.sellerLegalBlock);

    return {
      data: {
        settings: {
          financialPolicy: this.toSnapshot(
            financialRow,
            SETTING_KEYS.financialPolicy,
            toFinancialPolicy(financialRow?.value ?? null),
          ),
          sellerLegalBlock: this.toSnapshot(
            legalRow,
            SETTING_KEYS.sellerLegalBlock,
            toSellerLegalBlock(legalRow?.value ?? null),
          ),
        },
      },
    };
  }

  async updateFinancialPolicy(
    ctx: ActorAndRequest,
    input: { expectedVersion: number; value: FinancialPolicyValueDto },
  ): Promise<FinancialPolicySettingsUpdateResponse> {
    this.assertFinancialPolicyLegal(input.value);
    await this.audit.record(this.baseRecord(ctx, 'settings.financial-policy.updated.attempt'));
    const row = await this.writeSetting(ctx, SETTING_KEYS.financialPolicy, input.expectedVersion, input.value);
    await this.audit.record(
      this.baseRecord(ctx, 'settings.financial-policy.updated.outcome', {
        after: { outcome: 'success', version: row.version },
      }),
    );
    return {
      data: {
        settings: {
          financialPolicy: this.toSnapshot(row, SETTING_KEYS.financialPolicy, toFinancialPolicy(row.value)),
        },
      },
    };
  }

  async updateSellerLegalBlock(
    ctx: ActorAndRequest,
    input: { expectedVersion: number; value: SellerLegalBlockValueDto },
  ): Promise<SellerLegalBlockUpdateResponse> {
    await this.audit.record(this.baseRecord(ctx, 'settings.seller-legal.updated.attempt'));
    const row = await this.writeSetting(ctx, SETTING_KEYS.sellerLegalBlock, input.expectedVersion, input.value);
    await this.audit.record(
      this.baseRecord(ctx, 'settings.seller-legal.updated.outcome', {
        after: { outcome: 'success', version: row.version },
      }),
    );
    return {
      data: {
        settings: {
          sellerLegalBlock: this.toSnapshot(row, SETTING_KEYS.sellerLegalBlock, toSellerLegalBlock(row.value)),
        },
      },
    };
  }

  private async writeSetting(
    ctx: ActorAndRequest,
    key: string,
    expectedVersion: number,
    value: Record<string, unknown>,
  ): Promise<SettingRow> {
    const existing = await this.prisma.setting.findUnique({ where: { key } });
    const currentVersion = existing?.version ?? 0;
    if (currentVersion !== expectedVersion) {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'The settings changed concurrently. Refresh and retry.',
      });
    }

    const row = await this.prisma.setting.upsert({
      where: { key },
      update: {
        value: value as Prisma.InputJsonValue,
        version: currentVersion + 1,
        updatedById: ctx.actorUserId,
      },
      create: {
        key,
        value: value as Prisma.InputJsonValue,
        group: SETTING_METADATA[key as keyof typeof SETTING_METADATA].group,
        description: SETTING_METADATA[key as keyof typeof SETTING_METADATA].description,
        isSecret: SETTING_METADATA[key as keyof typeof SETTING_METADATA].isSecret,
        version: currentVersion + 1,
        updatedById: ctx.actorUserId,
      },
    });
    return row;
  }

  private assertFinancialPolicyLegal(value: FinancialPolicyValueDto): void {
    if (value.withdrawalWindowDays < 7) {
      throw new UnprocessableEntityException({
        code: 'UNPROCESSABLE',
        message: 'The withdrawal window may not be set below the legal floor of 7 working days (EC Law Art. 37).',
      });
    }
    if (value.roundingMethod !== 'ROUND_HALF_UP') {
      throw new UnprocessableEntityException({
        code: 'UNPROCESSABLE',
        message: 'Rounding is locked to ROUND_HALF_UP per ADR-0003 and is not operator-configurable.',
      });
    }
  }

  private toSnapshot<T>(row: SettingRow | undefined, key: string, value: T): SettingSnapshot<T> {
    const metadata = SETTING_METADATA[key as keyof typeof SETTING_METADATA];
    return {
      key,
      group: metadata.group,
      description: metadata.description,
      isSecret: metadata.isSecret,
      version: row?.version ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      value,
    };
  }

  private baseRecord(
    ctx: ActorAndRequest,
    action: string,
    extra: { after?: Prisma.InputJsonValue } = {},
  ): AuditEventInput {
    return {
      actorId: ctx.actorUserId,
      action,
      entityType: 'Setting',
      entityId: null,
      requestId: ctx.requestId,
      ...(extra.after !== undefined ? { after: extra.after } : {}),
    };
  }
}