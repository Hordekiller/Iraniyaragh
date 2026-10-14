import { ConflictException, HttpException, Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma, type InventoryCostPolicyRevision } from '@prisma/client';
import { createHash } from 'node:crypto';
import type { InventoryCostPolicy, InventoryCostPolicyState, InventoryCostPolicyUpdate } from '@iranyaragh/contracts';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { isPrismaTransactionConflict, withSerializableRetry } from '../../common/serializable-retry';
import { RedactedLogger } from '../../common/redacted-logger';
import { costPolicyInput } from './inventory-cost-policy.validation';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const project = (row: InventoryCostPolicyRevision): InventoryCostPolicy => ({ id: row.id, version: row.version, method: row.method, createdAt: row.createdAt.toISOString() });
export const disabledCostPolicy = (policy: InventoryCostPolicy | null): InventoryCostPolicyState => ({
  policy, valuationEnabled: false, activationGate: 'COST_LEDGER_ACCEPTANCE_REQUIRED', missingCostTreatment: 'REQUIRE_EVIDENCE',
});

@Injectable()
export class InventoryCostPolicyService {
  constructor(@Inject(PrismaService) private readonly database: PrismaService, @Inject(AuditLogService) private readonly audit: AuditLogService) {}

  async read(): Promise<InventoryCostPolicyState> {
    try {
      const latest = await this.database.inventoryCostPolicyRevision.findFirst({ orderBy: { version: 'desc' } });
      return disabledCostPolicy(latest ? project(latest) : null);
    } catch (cause) { return this.unavailable(cause); }
  }

  async revise(actorId: string, requestId: string, raw: InventoryCostPolicyUpdate, key: string): Promise<InventoryCostPolicyState> {
    const input = costPolicyInput(raw);
    if (!actorId || typeof requestId !== 'string' || !requestId.trim() || requestId.length > 100)
      throw new InternalServerErrorException({ code: 'INVENTORY_COST_POLICY_UNAVAILABLE', message: 'A tracked policy change is required.' });
    const keyHash = digest(normalizeIdempotencyKey(key));
    const payloadHash = digest(JSON.stringify(input));
    try {
      const revision = await withSerializableRetry({ isContention: isPrismaTransactionConflict,
        conflictMessage: 'Cost policy changed concurrently; reload its current revision.',
        operation: () => this.database.$transaction(async tx => {
          // Same lock as SQL: direct writers and API writers share the sequence.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(1768842863, 1668248436)`;
          const replay = await tx.inventoryCostPolicyCommand.findUnique({ where: { actorId_keyHash: { actorId, keyHash } }, include: { revision: true } });
          if (replay) {
            if (replay.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'This retry key belongs to different policy input.' });
            return replay.revision;
          }
          const head = await tx.inventoryCostPolicyRevision.findFirst({ orderBy: { version: 'desc' } });
          if ((head?.version ?? null) !== input.expectedVersion) throw new ConflictException({ code: 'STALE_VERSION', message: 'Review the current cost policy before submitting.' });
          const next = await tx.inventoryCostPolicyRevision.create({ data: { method: input.method, reason: input.reason, version: (head?.version ?? 0) + 1, actorId, requestId } });
          await tx.inventoryCostPolicyCommand.create({ data: { actorId, keyHash, payloadHash, revisionId: next.id } });
          await this.audit.record({ actorId, requestId, action: 'inventory.cost_policy.revised', entityType: 'inventory_cost_policy', entityId: next.id,
            before: { version: head?.version ?? null }, after: { version: next.version, method: next.method, valuationEnabled: false }, metadata: { reasonRecorded: true } }, tx);
          return next;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 5000, maxWait: 2000 }),
      });
      return disabledCostPolicy(project(revision));
    } catch (cause) { return this.unavailable(cause); }
  }

  private unavailable(cause: unknown): never {
    if (cause instanceof HttpException) throw cause;
    new RedactedLogger().event('error', { event: 'inventory.cost_policy.unavailable', outcome: 'unknown', errorCode: 'INVENTORY_COST_POLICY_UNAVAILABLE' });
    throw new InternalServerErrorException({ code: 'INVENTORY_COST_POLICY_UNAVAILABLE', message: 'Cost configuration could not be confirmed; reconcile before retry.' });
  }
}
