import { createHash, randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { ShippingMethodSettings, ShippingMethodSettingsUpdate } from '@iranyaragh/contracts';
import { Prisma, type ShippingMethod } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';

function view(row: ShippingMethod): ShippingMethodSettings {
  return { code: row.code, title: row.title, amount: { amount: row.amount.toString(), currency: 'IRR' }, isActive: row.isActive,
    version: row.version, policyRevision: row.policyRevision, updatedAt: row.updatedAt.toISOString() };
}
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

@Injectable()
export class ShippingSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  async list(): Promise<ShippingMethodSettings[]> {
    return (await this.prisma.shippingMethod.findMany({ orderBy: { code: 'asc' }, take: 100 })).map(view);
  }

  async update(actorId: string, requestId: string, code: string, input: ShippingMethodSettingsUpdate, idempotencyKey: string): Promise<ShippingMethodSettings> {
    const title = typeof input.title === 'string' ? input.title.normalize('NFKC').trim() : '';
    const valid = /^[a-z][a-z0-9-]{0,63}$/u.test(code) && /^\P{Cc}{1,120}$/u.test(title) &&
      input.amount?.currency === 'IRR' && typeof input.amount.amount === 'string' && /^(0|[1-9][0-9]{0,18})$/u.test(input.amount.amount) &&
      BigInt(input.amount.amount) <= 9223372036854775807n && typeof input.isActive === 'boolean' &&
      (input.expectedVersion === null || (Number.isSafeInteger(input.expectedVersion) && input.expectedVersion >= 0));
    if (!valid) throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'Valid shipping code, title, integer IRR amount and expected version are required.' });
    const payload = { ...input, title };
    const keyHash = hash(idempotencyKey);
    const payloadHash = hash(JSON.stringify([title, input.amount.amount, 'IRR', input.isActive, input.expectedVersion]));
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Shipping configuration changed concurrently; reload before retrying.',
      operation: () => this.prisma.$transaction(async (tx) => {
        const [hi, lo] = advisoryLockIdKey('shipping-method', code);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const now = new Date();
        await tx.shippingMethodMutation.deleteMany({ where: { actorId, code, expiresAt: { lte: now } } });
        const previous = await tx.shippingMethodMutation.findUnique({ where: { actorId_code_keyHash: { actorId, code, keyHash } } });
        if (previous) {
          if (previous.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Retry key payload changed.' });
          return previous.response as unknown as ShippingMethodSettings;
        }
        const current = await tx.shippingMethod.findUnique({ where: { code } });
        if ((current?.version ?? null) !== payload.expectedVersion)
          throw new ConflictException({ code: 'STALE_VERSION', message: 'Reload the shipping method before editing its current version.' });
        if (!current && await tx.shippingMethod.count() >= 100)
          throw new ConflictException({ code: 'CONFLICT', message: 'Shipping method limit reached.' });
        const data = { title, amount: BigInt(payload.amount.amount), isActive: payload.isActive, policyRevision: `shipping-${randomUUID()}` };
        const changed = current
          ? await tx.shippingMethod.update({ where: { id: current.id }, data: { ...data, version: { increment: 1 } } })
          : await tx.shippingMethod.create({ data: { ...data, code } });
        const result = view(changed);
        await this.audit.record({ action: current ? 'shipping.method.updated' : 'shipping.method.created', entityType: 'shipping_method', entityId: changed.id,
          actorId, requestId, before: current ? view(current) : undefined, after: result }, tx);
        await tx.shippingMethodMutation.create({ data: { actorId, code, keyHash, payloadHash, response: result as Prisma.InputJsonObject, expiresAt: new Date(now.getTime() + 86400000) } });
        return result;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
  }
}
