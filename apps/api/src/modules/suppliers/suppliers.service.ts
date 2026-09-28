import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Supplier as SupplierRow } from '@prisma/client';
import type { Supplier, SupplierAuditResponse, SupplierListResponse } from '@iranyaragh/contracts';
import { createHash } from 'node:crypto';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { retryDelayMs, sleep } from '../../common/retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { SupplierCreateDto, SupplierListQueryDto, SupplierUpdateDto } from './suppliers.dto';

const keyPattern = /^[A-Za-z0-9_-]{8,96}$/u;
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const byCodeUnit = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return `{${Object.keys(object).sort(byCodeUnit).map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}
const notFound = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Supplier not found.' });
const stale = () => new ConflictException({ code: 'VERSION_CONFLICT', message: 'Supplier changed; reload before editing.' });

function publicSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id, code: row.code, name: row.name,
    mobile: row.mobile, phone: row.phone, email: row.email,
    nationalId: row.nationalId, economicCode: row.economicCode,
    isActive: row.isActive, version: row.version,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

type CommandContext = { actorId: string; requestId: string | null; idempotencyKey: string };

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async list(query: SupplierListQueryDto): Promise<SupplierListResponse> {
    const where = query.isActive === undefined ? {} : { isActive: query.isActive };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items: rows.map(publicSupplier), count: total };
  }

  async get(id: string): Promise<Supplier> {
    const row = await this.prisma.supplier.findUnique({ where: { id } });
    if (!row) throw notFound();
    return publicSupplier(row);
  }

  async history(id: string, query: SupplierListQueryDto): Promise<SupplierAuditResponse> {
    if (!await this.prisma.supplier.findUnique({ where: { id }, select: { id: true } })) throw notFound();
    const where = { entityType: 'Supplier', entityId: id };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, select: { id: true, action: true, actorId: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), count: total };
  }

  async create(input: SupplierCreateDto, context: CommandContext): Promise<Supplier> {
    const payload = { code: input.code, name: input.name, mobile: input.mobile ?? null, phone: input.phone ?? null,
      email: input.email ?? null, nationalId: input.nationalId ?? null, economicCode: input.economicCode ?? null };
    try {
      return await this.command('create', payload, context, async tx => {
        const row = await tx.supplier.create({ data: payload });
        await this.audit.record({ action: 'supplier.created', entityType: 'Supplier', entityId: row.id,
          actorId: context.actorId, requestId: context.requestId,
          metadata: { code: row.code } }, tx);
        return publicSupplier(row);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({ code: 'SUPPLIER_CODE_CONFLICT', message: 'Supplier code already exists.' });
      }
      throw error;
    }
  }

  async update(id: string, input: SupplierUpdateDto, context: CommandContext): Promise<Supplier> {
    const { expectedVersion, ...changes } = input;
    const data = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
    if (Object.keys(data).length === 0) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'At least one supplier field must change.' });
    }
    return this.command(`update:${id}`, { expectedVersion, ...data }, context, async tx => {
      const existing = await tx.supplier.findUnique({ where: { id } });
      if (!existing) throw notFound();
      if (existing.version !== expectedVersion) throw stale();
      const changed = await tx.supplier.updateMany({ where: { id, version: expectedVersion }, data: { ...data, version: { increment: 1 } } });
      if (changed.count !== 1) throw stale();
      const row = await tx.supplier.findUniqueOrThrow({ where: { id } });
      await this.audit.record({ action: existing.isActive && !row.isActive ? 'supplier.deactivated' : 'supplier.updated',
        entityType: 'Supplier', entityId: id, actorId: context.actorId, requestId: context.requestId,
        metadata: { changedFields: Object.keys(data), fromVersion: existing.version, toVersion: row.version } }, tx);
      return publicSupplier(row);
    });
  }

  private async command(scope: string, payload: unknown, context: CommandContext,
    execute: (tx: Prisma.TransactionClient) => Promise<Supplier>): Promise<Supplier> {
    if (!keyPattern.test(context.idempotencyKey ?? '')) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Idempotency-Key must contain 8-96 ASCII letters, digits, underscores or hyphens.' });
    }
    const keyHash = sha256(context.idempotencyKey);
    const payloadHash = sha256(stableJson(payload));
    const key = { actorId: context.actorId, scope, keyHash };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async tx => {
        const [hi, lo] = advisoryLockIdKey('supplier-command', context.actorId, scope, keyHash);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
        const prior = await tx.supplierCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
        if (prior) {
          if (prior.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Key reused with another supplier command.' });
          if (prior.response === null) throw new ConflictException({ code: 'CONFLICT', message: 'Command is still committing.' });
          return prior.response as Supplier;
        }
        const record = await tx.supplierCommandRecord.create({ data: { ...key, payloadHash } });
        const result = await execute(tx);
        await tx.supplierCommandRecord.update({ where: { id: record.id }, data: { response: result as Prisma.InputJsonValue } });
        return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) { await sleep(retryDelayMs(attempt)); continue; }
          throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Concurrent supplier command; retry with the same idempotency key.' });
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Supplier command could not be committed.' });
  }
}
