import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { StorefrontHelperAdminConfig, StorefrontHelperPublicConfig, StorefrontHelperUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

export const CUSTOMER_HELPER_FLAG = 'customer-helper';
/** Until an admin decides otherwise the helper is shown. */
export const CUSTOMER_HELPER_DEFAULT = true;

export function validateHelperUpdate(input: StorefrontHelperUpdate): StorefrontHelperUpdate {
  if (!Number.isSafeInteger(input?.expectedVersion) || input.expectedVersion < 0 || typeof input.enabled !== 'boolean') {
    throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'expectedVersion and enabled are required.' });
  }
  return { expectedVersion: input.expectedVersion, enabled: input.enabled };
}

@Injectable()
export class StorefrontHelperService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  private project(row: { enabled: boolean; version: number; updatedAt: Date } | null): StorefrontHelperAdminConfig {
    return { enabled: row?.enabled ?? CUSTOMER_HELPER_DEFAULT, version: row?.version ?? 0, updatedAt: row?.updatedAt.toISOString() ?? null };
  }

  async readAdmin(): Promise<StorefrontHelperAdminConfig> {
    return this.project(await this.prisma.storefrontFeatureFlag.findUnique({ where: { key: CUSTOMER_HELPER_FLAG } }));
  }

  async readPublic(): Promise<StorefrontHelperPublicConfig> {
    return { enabled: (await this.readAdmin()).enabled };
  }

  async update(actorId: string, requestId: string, raw: StorefrontHelperUpdate): Promise<StorefrontHelperAdminConfig> {
    const input = validateHelperUpdate(raw);
    return this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1752064113, 1935892597)`;
      const current = await tx.storefrontFeatureFlag.findUnique({ where: { key: CUSTOMER_HELPER_FLAG } });
      if ((current?.version ?? 0) !== input.expectedVersion) {
        throw new ConflictException({ code: 'STALE_VERSION', message: 'The helper setting changed; reload before saving.' });
      }
      const before = this.project(current);
      const row = current
        ? await tx.storefrontFeatureFlag.update({ where: { key: CUSTOMER_HELPER_FLAG }, data: { enabled: input.enabled, version: current.version + 1 } })
        : await tx.storefrontFeatureFlag.create({ data: { key: CUSTOMER_HELPER_FLAG, enabled: input.enabled, version: 1 } });
      const after = this.project(row);
      await this.audit.record({ actorId, requestId, action: 'storefront.customer_helper.updated', entityType: 'storefront_feature_flag', entityId: CUSTOMER_HELPER_FLAG, before, after }, tx);
      return after;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 });
  }
}
