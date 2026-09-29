import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type PurchaseOrderStatus } from '@prisma/client';
import type { PurchaseOrder, PurchaseOrderAuditResponse, PurchaseOrderItemInput, PurchaseOrderListResponse, PurchaseOrderOptionsResponse } from '@iranyaragh/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { retryDelayMs, sleep } from '../../common/retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { PurchaseOrderActionDto, PurchaseOrderCreateDto, PurchaseOrderHistoryQueryDto, PurchaseOrderListQueryDto, PurchaseOrderOptionsQueryDto, PurchaseOrderUpdateDto } from './purchasing.dto';

const MAX_I64 = 9_223_372_036_854_775_807n;
const keyPattern = /^[A-Za-z0-9_-]{8,96}$/u;
const costPattern = /^[1-9][0-9]{0,18}$/u;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Purchase order not found.' });
const versionConflict = () => new ConflictException({ code: 'VERSION_CONFLICT', message: 'Purchase order changed; reload before editing.' });
const stateConflict = () => new ConflictException({ code: 'PURCHASE_ORDER_STATE_CONFLICT', message: 'Purchase order is not in the required state.' });

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const byCodeUnit = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return `{${Object.keys(object).sort(byCodeUnit).map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

const orderInclude = { items: { include: { variant: { select: { sku: true } } }, orderBy: { variantId: 'asc' } } } as const;
type OrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;
type Context = { actorId: string; requestId: string | null; idempotencyKey: string };
type Line = { variantId: string; orderedQty: number; unitCost: bigint };

function normalizeLines(items: PurchaseOrderItemInput[]): Line[] {
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Purchase order needs 1–100 lines.' });
  }
  const ids = new Set<string>();
  let total = 0n;
  const lines = items.map(item => {
    if (typeof item.variantId !== 'string' || !item.variantId || ids.has(item.variantId) || !Number.isInteger(item.orderedQty) || item.orderedQty < 1 || item.orderedQty > 1_000_000 || typeof item.unitCost !== 'string' || !costPattern.test(item.unitCost)) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Duplicate or invalid purchase order line.' });
    }
    ids.add(item.variantId);
    const unitCost = BigInt(item.unitCost);
    total += unitCost * BigInt(item.orderedQty);
    if (unitCost > MAX_I64 || total > MAX_I64) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Purchase order cost exceeds supported integer IRR range.' });
    }
    return { variantId: item.variantId, orderedQty: item.orderedQty, unitCost };
  });
  return lines.sort((a, b) => a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0);
}

function assertCommandTarget(id: string, expectedVersion: number): void {
  if (!/^[A-Za-z0-9_-]{1,64}$/u.test(id) || !Number.isInteger(expectedVersion) || expectedVersion < 0) {
    throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Invalid purchase order ID or expectedVersion.' });
  }
}

function publicOrder(row: OrderRow): PurchaseOrder {
  const items = row.items.map(item => ({
    id: item.id, variantId: item.variantId, sku: item.variant.sku,
    orderedQty: item.orderedQty, receivedQty: item.receivedQty,
    unitCost: item.unitCost.toString(), lineCost: (item.unitCost * BigInt(item.orderedQty)).toString(),
  }));
  const totalCost = row.items.reduce((sum, item) => sum + item.unitCost * BigInt(item.orderedQty), 0n).toString();
  return { id: row.id, number: row.number, supplierId: row.supplierId, warehouseId: row.warehouseId,
    status: row.status, version: row.version, expectedAt: row.expectedAt?.toISOString() ?? null,
    notes: row.notes, items, totalCost, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

@Injectable()
export class PurchasingService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  async options(query: PurchaseOrderOptionsQueryDto): Promise<PurchaseOrderOptionsResponse> {
    const search = query.search?.trim() || undefined;
    if (query.kind === 'supplier') {
      const where: Prisma.SupplierWhereInput = { isActive: true, ...(search ? { OR: [
        { code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } },
      ] } : {}) };
      const [rows, count] = await this.prisma.$transaction([
        this.prisma.supplier.findMany({ where, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, skip: query.offset, take: query.limit }),
        this.prisma.supplier.count({ where }),
      ]);
      return { items: rows.map(row => ({ id: row.id, code: row.code, label: row.name })), count };
    }
    if (query.kind === 'warehouse') {
      const where: Prisma.WarehouseWhereInput = { isActive: true, ...(search ? { OR: [
        { code: { contains: search, mode: 'insensitive' } }, { name: { contains: search, mode: 'insensitive' } },
      ] } : {}) };
      const [rows, count] = await this.prisma.$transaction([
        this.prisma.warehouse.findMany({ where, select: { id: true, code: true, name: true }, orderBy: { code: 'asc' }, skip: query.offset, take: query.limit }),
        this.prisma.warehouse.count({ where }),
      ]);
      return { items: rows.map(row => ({ id: row.id, code: row.code, label: row.name })), count };
    }
    const where: Prisma.ProductVariantWhereInput = { isActive: true, status: 'ACTIVE', product: { status: 'ACTIVE' },
      ...(search ? { OR: [{ sku: { contains: search, mode: 'insensitive' } },
        { product: { name: { contains: search, mode: 'insensitive' } } }] } : {}) };
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({ where, select: { id: true, sku: true, title: true, product: { select: { name: true } } }, orderBy: { sku: 'asc' }, skip: query.offset, take: query.limit }),
      this.prisma.productVariant.count({ where }),
    ]);
    return { items: rows.map(row => ({ id: row.id, code: row.sku, label: `${row.product.name}${row.title ? ` — ${row.title}` : ''}` })), count };
  }

  async list(query: PurchaseOrderListQueryDto): Promise<PurchaseOrderListResponse> {
    const where = { ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}) };
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({ where, include: orderInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { items: rows.map(publicOrder), count };
  }

  async get(id: string): Promise<PurchaseOrder> {
    const row = await this.prisma.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
    if (!row) throw missing();
    return publicOrder(row);
  }

  async history(id: string, query: PurchaseOrderHistoryQueryDto): Promise<PurchaseOrderAuditResponse> {
    if (!await this.prisma.purchaseOrder.findUnique({ where: { id }, select: { id: true } })) throw missing();
    const where = { entityType: 'PurchaseOrder', entityId: id };
    const [rows, count] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({ where, select: { id: true, action: true, actorId: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: query.offset, take: query.limit }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), count };
  }

  async create(input: PurchaseOrderCreateDto, context: Context): Promise<PurchaseOrder> {
    const items = normalizeLines(input.items);
    const payload = { supplierId: input.supplierId, warehouseId: input.warehouseId,
      expectedAt: input.expectedAt ?? null, notes: input.notes ?? null,
      items: items.map(item => ({ ...item, unitCost: item.unitCost.toString() })) };
    return this.command('create', payload, context, async tx => {
      await this.assertActiveReferences(tx, input.supplierId, input.warehouseId, items);
      const row = await tx.purchaseOrder.create({ data: {
        number: `PO-${randomUUID().replaceAll('-', '').toUpperCase()}`,
        supplierId: input.supplierId, warehouseId: input.warehouseId,
        expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
        notes: input.notes ?? null,
        items: { create: items },
      }, include: orderInclude });
      await this.audit.record({ action: 'purchase-order.created', entityType: 'PurchaseOrder', entityId: row.id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { number: row.number, lineCount: items.length } }, tx);
      return publicOrder(row);
    });
  }

  async update(id: string, input: PurchaseOrderUpdateDto, context: Context): Promise<PurchaseOrder> {
    assertCommandTarget(id, input.expectedVersion);
    const hasItems = input.items !== undefined;
    if (!hasItems && input.expectedAt === undefined && input.notes === undefined) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'At least one draft field must change.' });
    }
    const items = hasItems ? normalizeLines(input.items!) : undefined;
    const payload = { expectedVersion: input.expectedVersion,
      ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(items ? { items: items.map(item => ({ ...item, unitCost: item.unitCost.toString() })) } : {}) };
    return this.command(`update:${id}`, payload, context, async tx => {
      const current = await tx.purchaseOrder.findUnique({ where: { id }, select: { version: true, status: true, supplierId: true, warehouseId: true } });
      if (!current) throw missing();
      if (current.status !== 'DRAFT') throw stateConflict();
      if (current.version !== input.expectedVersion) throw versionConflict();
      if (items) await this.assertActiveReferences(tx, current.supplierId, current.warehouseId, items);
      const changed = await tx.purchaseOrder.updateMany({ where: { id, version: input.expectedVersion, status: 'DRAFT' },
        data: { version: { increment: 1 },
          ...(input.expectedAt !== undefined ? { expectedAt: input.expectedAt ? new Date(input.expectedAt) : null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}) } });
      if (changed.count !== 1) throw versionConflict();
      if (items) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({ data: items.map(item => ({ purchaseOrderId: id, ...item })) });
      }
      const row = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
      await this.audit.record({ action: 'purchase-order.updated', entityType: 'PurchaseOrder', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { changedFields: Object.keys(payload).filter(key => key !== 'expectedVersion'), fromVersion: current.version, toVersion: row.version } }, tx);
      return publicOrder(row);
    });
  }

  async approve(id: string, input: PurchaseOrderActionDto, context: Context): Promise<PurchaseOrder> {
    return this.transition(id, 'APPROVED', ['DRAFT'], input.expectedVersion, context);
  }

  async cancel(id: string, input: PurchaseOrderActionDto, context: Context): Promise<PurchaseOrder> {
    return this.transition(id, 'CANCELLED', ['DRAFT', 'APPROVED'], input.expectedVersion, context);
  }

  private async transition(id: string, target: 'APPROVED' | 'CANCELLED', allowed: PurchaseOrderStatus[],
    expectedVersion: number, context: Context): Promise<PurchaseOrder> {
    assertCommandTarget(id, expectedVersion);
    return this.command(`${target.toLowerCase()}:${id}`, { expectedVersion }, context, async tx => {
      const current = await tx.purchaseOrder.findUnique({ where: { id }, include: { items: true } });
      if (!current) throw missing();
      if (!allowed.includes(current.status) || current.items.some(item => item.receivedQty !== 0)) throw stateConflict();
      if (current.version !== expectedVersion) throw versionConflict();
      if (target === 'APPROVED') {
        if (current.items.length === 0) throw stateConflict();
        await this.assertActiveReferences(tx, current.supplierId, current.warehouseId, current.items);
      }
      const changed = await tx.purchaseOrder.updateMany({ where: { id, version: expectedVersion, status: current.status },
        data: { status: target, version: { increment: 1 } } });
      if (changed.count !== 1) throw versionConflict();
      const row = await tx.purchaseOrder.findUniqueOrThrow({ where: { id }, include: orderInclude });
      await this.audit.record({ action: target === 'APPROVED' ? 'purchase-order.approved' : 'purchase-order.cancelled',
        entityType: 'PurchaseOrder', entityId: id, actorId: context.actorId, requestId: context.requestId,
        metadata: { from: current.status, to: target, fromVersion: current.version, toVersion: row.version } }, tx);
      return publicOrder(row);
    });
  }

  private async assertActiveReferences(tx: Prisma.TransactionClient, supplierId: string, warehouseId: string, items: Line[]): Promise<void> {
    const [supplier, warehouse, variants] = await Promise.all([
      tx.supplier.findUnique({ where: { id: supplierId }, select: { isActive: true } }),
      tx.warehouse.findUnique({ where: { id: warehouseId }, select: { isActive: true } }),
      tx.productVariant.findMany({ where: { id: { in: items.map(item => item.variantId) } },
        select: { id: true, isActive: true, status: true, product: { select: { status: true } } } }),
    ]);
    if (!supplier?.isActive) throw new ConflictException({ code: 'SUPPLIER_INACTIVE', message: 'Supplier is unavailable for purchasing.' });
    if (!warehouse?.isActive) throw new ConflictException({ code: 'WAREHOUSE_INACTIVE', message: 'Warehouse is unavailable for purchasing.' });
    if (variants.length !== items.length || variants.some(variant => !variant.isActive || variant.status !== 'ACTIVE' || variant.product.status !== 'ACTIVE')) {
      throw new ConflictException({ code: 'VARIANT_INACTIVE', message: 'One or more purchase order SKUs are unavailable.' });
    }
  }

  private async command(scope: string, payload: unknown, context: Context,
    execute: (tx: Prisma.TransactionClient) => Promise<PurchaseOrder>): Promise<PurchaseOrder> {
    if (!keyPattern.test(context.idempotencyKey ?? '')) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Idempotency-Key must contain 8–96 ASCII letters, digits, underscores or hyphens.' });
    }
    const keyHash = hash(context.idempotencyKey);
    const payloadHash = hash(stableJson(payload));
    const key = { actorId: context.actorId, scope, keyHash };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async tx => {
          const [hi, lo] = advisoryLockIdKey('purchase-order-command', context.actorId, scope, keyHash);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
          const prior = await tx.purchaseOrderCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
          if (prior) {
            if (prior.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Key reused with another purchase order command.' });
            if (prior.response === null) throw new ConflictException({ code: 'CONFLICT', message: 'Command is still committing.' });
            return prior.response as PurchaseOrder;
          }
          const record = await tx.purchaseOrderCommandRecord.create({ data: { ...key, payloadHash } });
          const result = await execute(tx);
          await tx.purchaseOrderCommandRecord.update({ where: { id: record.id }, data: { response: result as Prisma.InputJsonValue } });
          return result;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) { await sleep(retryDelayMs(attempt)); continue; }
          throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Concurrent purchase order command; retry with the same key.' });
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Purchase order command could not be committed.' });
  }
}
