import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Stocktake, StocktakeAuditResponse, StocktakeDetail, StocktakeLine, StocktakeLineInput, StocktakeListResponse, StocktakeLocationOptionsResponse, StocktakeSummary, StocktakeVariantOptionsResponse } from '@iranyaragh/contracts';
import { createHash, randomUUID } from 'node:crypto';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { retryDelayMs, sleep } from '../../common/retry';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';
import type { StocktakeActionDto, StocktakeCountDto, StocktakeCreateDto, StocktakeHistoryQueryDto, StocktakeListQueryDto, StocktakeLocationQueryDto, StocktakeVariantQueryDto } from './stocktake.dto';

const MAX_QTY = 2_000_000_000;
const keyPattern = /^[A-Za-z0-9_-]{8,96}$/u;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const missing = () => new NotFoundException({ code: 'STOCKTAKE_NOT_FOUND', message: 'Stocktake not found.' });
const versionConflict = () => new ConflictException({ code: 'STOCKTAKE_VERSION_CONFLICT', message: 'Stocktake changed; reload before continuing.' });
const stateConflict = (message: string) => new ConflictException({ code: 'STOCKTAKE_STATE_CONFLICT', message });

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  const byCodeUnit = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  return `{${Object.keys(object).sort(byCodeUnit).map(key => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

const detailInclude = {
  warehouse: { select: { code: true, name: true } },
  items: {
    include: {
      location: { select: { code: true, name: true } },
      variant: { select: { sku: true, title: true, product: { select: { name: true } } } },
    },
    orderBy: [{ locationId: 'asc' }, { variantId: 'asc' }],
  },
} satisfies Prisma.StocktakeInclude;

type DetailRow = Prisma.StocktakeGetPayload<{ include: typeof detailInclude }>;
const listSelect = {
  id: true, number: true, status: true, scopeType: true, version: true, warehouseId: true, notes: true,
  createdById: true, countedById: true, approvedById: true,
  createdAt: true, updatedAt: true, startedAt: true, submittedAt: true, completedAt: true, cancelledAt: true,
  warehouse: { select: { code: true, name: true } },
  items: { select: { countedQty: true, difference: true } },
} satisfies Prisma.StocktakeSelect;
type ListRow = Prisma.StocktakeGetPayload<{ select: typeof listSelect }>;

export type StocktakeContext = {
  actorId: string;
  requestId: string | null;
  idempotencyKey: string;
  canApprove: boolean;
};

@Injectable()
export class StocktakeService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditLogService) {}

  /**
   * `expectedQty` and `difference` are stripped for principals without
   * `stocktake.approve`. Counting must stay blind, otherwise the counter
   * anchors the physical count on the system number.
   */
  private lines(row: DetailRow, canApprove: boolean): StocktakeLine[] {
    return row.items.map(item => ({
      id: item.id,
      locationId: item.locationId,
      locationCode: item.location.code,
      locationName: item.location.name,
      variantId: item.variantId,
      sku: item.variant.sku,
      productName: item.variant.product.name,
      variantTitle: item.variant.title,
      ...(canApprove ? { expectedQty: item.expectedQty } : {}),
      countedQty: item.countedQty,
      ...(canApprove ? { difference: item.difference } : {}),
      countedAt: item.countedAt?.toISOString() ?? null,
      notes: item.notes,
      countedById: item.countedById,
      movementId: item.movementId,
    }));
  }

  private summary(items: { countedQty: number | null; difference: number | null }[], canApprove: boolean): StocktakeSummary {
    const countedLines = items.filter(item => item.countedQty !== null).length;
    const summary: StocktakeSummary = {
      totalLines: items.length,
      countedLines,
      pendingLines: items.length - countedLines,
    };
    if (canApprove) {
      summary.netDifference = items.reduce((total, item) => total + (item.difference ?? 0), 0);
    }
    return summary;
  }

  private toDetail(row: DetailRow, canApprove: boolean): StocktakeDetail {
    return {
      id: row.id, number: row.number, status: row.status, version: row.version,
      warehouseId: row.warehouseId, warehouseCode: row.warehouse.code, warehouseName: row.warehouse.name,
      scopeType: row.scopeType, notes: row.notes,
      createdById: row.createdById, countedById: row.countedById, approvedById: row.approvedById,
      startedAt: row.startedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      summary: this.summary(row.items, canApprove),
      lines: this.lines(row, canApprove),
    };
  }

  private toListItem(row: ListRow, canApprove: boolean): Stocktake {
    const base = {
      id: row.id, number: row.number, status: row.status, version: row.version,
      warehouseId: row.warehouseId, warehouseCode: row.warehouse.code, warehouseName: row.warehouse.name,
      scopeType: row.scopeType, notes: row.notes,
      createdById: row.createdById, countedById: row.countedById, approvedById: row.approvedById,
      startedAt: row.startedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    return { ...base, summary: this.summary(row.items, canApprove) };
  }

  async list(query: StocktakeListQueryDto, context: StocktakeContext): Promise<StocktakeListResponse> {
    const rows = await this.prisma.stocktake.findMany({
      where: { status: query.status, warehouseId: query.warehouseId },
      select: listSelect,
      orderBy: { createdAt: 'desc' },
      skip: query.offset,
      take: query.limit,
    });
    return { items: rows.map(row => this.toListItem(row, context.canApprove)), count: rows.length };
  }

  async get(id: string, context: StocktakeContext): Promise<StocktakeDetail> {
    const row = await this.prisma.stocktake.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw missing();
    return this.toDetail(row, context.canApprove);
  }

  async locations(query: StocktakeLocationQueryDto): Promise<StocktakeLocationOptionsResponse> {
    const rows = await this.prisma.warehouseLocation.findMany({
      where: { warehouseId: query.warehouseId, isActive: true, code: { contains: query.search ?? '', mode: 'insensitive' } },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
      skip: query.offset,
      take: query.limit,
    });
    return { items: rows.map(row => ({ id: row.id, code: row.code, label: row.name ?? row.code })), count: rows.length };
  }

  async variants(query: StocktakeVariantQueryDto): Promise<StocktakeVariantOptionsResponse> {
    const rows = await this.prisma.productVariant.findMany({
      where: {
        isActive: true, status: 'ACTIVE', product: { status: 'ACTIVE' },
        sku: { contains: query.search ?? '', mode: 'insensitive' },
      },
      select: { id: true, sku: true, product: { select: { name: true } }, title: true },
      orderBy: { sku: 'asc' },
      skip: query.offset,
      take: query.limit,
    });
    return {
      items: rows.map(row => ({ id: row.id, sku: row.sku, label: row.title ? `${row.product.name} — ${row.title}` : row.product.name })),
      count: rows.length,
    };
  }

  async history(id: string, query: StocktakeHistoryQueryDto): Promise<StocktakeAuditResponse> {
    const exists = await this.prisma.stocktake.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw missing();
    const rows = await this.prisma.auditLog.findMany({
      where: { entityType: 'Stocktake', entityId: id },
      select: { id: true, action: true, actorId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      skip: query.offset,
      take: query.limit,
    });
    return {
      items: rows.map(row => ({ id: row.id, action: row.action, actorId: row.actorId, createdAt: row.createdAt.toISOString() })),
      count: rows.length,
    };
  }

  async create(input: StocktakeCreateDto, context: StocktakeContext): Promise<StocktakeDetail> {
    const scopeType = input.scopeType ?? 'WAREHOUSE';
    if (scopeType === 'LOCATIONS' && !input.locationIds?.length) {
      throw new BadRequestException({ code: 'STOCKTAKE_LOCATION_REQUIRED', message: 'Choose at least one location to count.' });
    }
    if (scopeType === 'VARIANTS' && !input.variantIds?.length) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Choose at least one SKU to count.' });
    }
    const locationIds = unique(input.locationIds);
    const variantIds = unique(input.variantIds);
    const payload = { warehouseId: input.warehouseId, scopeType, locationIds, variantIds, notes: input.notes ?? null };
    return this.command('create', payload, context, async tx => {
      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId }, select: { isActive: true } });
      if (!warehouse?.isActive) throw new ConflictException({ code: 'WAREHOUSE_INACTIVE', message: 'Warehouse is unavailable for stocktake.' });
      if (locationIds.length) {
        const found = await tx.warehouseLocation.count({ where: { id: { in: locationIds }, warehouseId: input.warehouseId, isActive: true } });
        if (found !== locationIds.length) throw new ConflictException({ code: 'LOCATION_INACTIVE', message: 'Count location is not active in this warehouse.' });
      }
      if (variantIds.length) {
        const found = await tx.productVariant.count({ where: { id: { in: variantIds }, isActive: true, status: 'ACTIVE', product: { status: 'ACTIVE' } } });
        if (found !== variantIds.length) throw new ConflictException({ code: 'VARIANT_INACTIVE', message: 'One or more SKUs are unavailable for stocktake.' });
      }
      const row = await tx.stocktake.create({ data: { number: `ST-${randomUUID().replaceAll('-', '').toUpperCase()}`,
        warehouseId: input.warehouseId, scopeType, notes: input.notes ?? null, createdById: context.actorId,
        scope: { locationIds, variantIds } as Prisma.InputJsonValue } });
      await this.audit.record({ action: 'stocktake.created', entityType: 'Stocktake', entityId: row.id,
        actorId: context.actorId, requestId: context.requestId, metadata: { warehouseId: input.warehouseId, scopeType } }, tx);
      return row.id;
    }, async (tx, id) => this.toDetail(await this.load(tx, id), context.canApprove));
  }

  /**
   * Materializes the count sheet from live balances. `expectedQty` is a
   * snapshot of the ledger at the moment counting opens, so a later approve
   * measures the physical count against the system number the counter actually
   * saw, while the movement still records the live before/after quantities.
   */
  async start(id: string, input: StocktakeActionDto, context: StocktakeContext): Promise<StocktakeDetail> {
    return this.command(`start:${id}`, { expectedVersion: input.expectedVersion }, context, async tx => {
      const [hi, lo] = advisoryLockIdKey('stocktake-session', id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const row = await tx.stocktake.findUnique({ where: { id } });
      if (!row) throw missing();
      if (row.status !== 'DRAFT') throw stateConflict('Only a draft stocktake can start counting.');
      if (row.version !== input.expectedVersion) throw versionConflict();
      const updated = await tx.stocktake.updateMany({ where: { id, version: input.expectedVersion, status: 'DRAFT' },
        data: { status: 'COUNTING', startedAt: new Date(), countedById: context.actorId, version: { increment: 1 } } });
      if (updated.count !== 1) throw versionConflict();
      const balances = await this.scopeBalances(tx, row);
      if (!balances.length) {
        throw new ConflictException({ code: 'STOCKTAKE_LINE_REQUIRED', message: 'This scope has no stock on hand to count.' });
      }
      await tx.stocktakeItem.createMany({ data: balances.map(balance => ({ stocktakeId: id, locationId: balance.locationId,
        variantId: balance.variantId, expectedQty: balance.onHand })) });
      await this.audit.record({ action: 'stocktake.started', entityType: 'Stocktake', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { lineCount: balances.length, from: 'DRAFT', to: 'COUNTING', fromVersion: row.version, toVersion: row.version + 1 } }, tx);
      return id;
    }, async (tx, target) => this.toDetail(await this.load(tx, target), context.canApprove));
  }

  async count(id: string, input: StocktakeCountDto, context: StocktakeContext): Promise<StocktakeDetail> {
    const lines = this.normalizeCounts(input.lines);
    return this.command(`count:${id}`, { expectedVersion: input.expectedVersion, lines }, context, async tx => {
      const [hi, lo] = advisoryLockIdKey('stocktake-session', id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const row = await tx.stocktake.findUnique({ where: { id }, include: { items: true } });
      if (!row) throw missing();
      if (row.status !== 'COUNTING' && row.status !== 'REVIEW') {
        throw stateConflict('Counts can only be recorded while a stocktake is open.');
      }
      if (row.version !== input.expectedVersion) throw versionConflict();
      const items = new Map(row.items.map(item => [`${item.locationId}\u0000${item.variantId}`, item]));
      for (const line of lines) {
        const item = items.get(`${line.locationId}\u0000${line.variantId}`);
        if (!item) {
          throw new BadRequestException({ code: 'STOCKTAKE_OUT_OF_SCOPE', message: 'Counted line is not part of this stocktake sheet.' });
        }
      }
      for (const line of lines) {
        const item = items.get(`${line.locationId}\u0000${line.variantId}`)!;
        await tx.stocktakeItem.update({ where: { id: item.id }, data: { countedQty: line.countedQty,
          countedAt: new Date(), countedById: context.actorId, notes: line.notes ?? null,
          difference: line.countedQty - item.expectedQty } });
      }
      const updated = await tx.stocktake.updateMany({ where: { id, version: input.expectedVersion, status: row.status },
        data: { version: { increment: 1 } } });
      if (updated.count !== 1) throw versionConflict();
      await this.audit.record({ action: 'stocktake.counted', entityType: 'Stocktake', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { lineCount: lines.length, netDifference: lines.reduce((total, line) => total + (line.countedQty - (items.get(`${line.locationId}\u0000${line.variantId}`)!.expectedQty)), 0),
          fromVersion: row.version, toVersion: row.version + 1 } }, tx);
      return id;
    }, async (tx, target) => this.toDetail(await this.load(tx, target), context.canApprove));
  }

  async submit(id: string, input: StocktakeActionDto, context: StocktakeContext): Promise<StocktakeDetail> {
    return this.command(`submit:${id}`, { expectedVersion: input.expectedVersion }, context, async tx => {
      const [hi, lo] = advisoryLockIdKey('stocktake-session', id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const row = await tx.stocktake.findUnique({ where: { id }, include: { items: { select: { countedQty: true } } } });
      if (!row) throw missing();
      if (row.status !== 'COUNTING') throw stateConflict('Only a counting stocktake can be submitted for review.');
      if (row.version !== input.expectedVersion) throw versionConflict();
      const updated = await tx.stocktake.updateMany({ where: { id, version: input.expectedVersion, status: 'COUNTING' },
        data: { status: 'REVIEW', submittedAt: new Date(), version: { increment: 1 } } });
      if (updated.count !== 1) throw versionConflict();
      await this.audit.record({ action: 'stocktake.submitted', entityType: 'Stocktake', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { countedLines: row.items.filter(item => item.countedQty !== null).length, lineCount: row.items.length,
          from: 'COUNTING', to: 'REVIEW', fromVersion: row.version, toVersion: row.version + 1 } }, tx);
      return id;
    }, async (tx, target) => this.toDetail(await this.load(tx, target), context.canApprove));
  }

  /**
   * Applies the count to the ledger. `onHand` is set to the counted quantity
   * measured against the live balance, and the whole approval is rejected when a
   * count would push available below zero because more is reserved than counted.
   * One STOCKTAKE movement per changed line keeps the ledger reconcilable; a line
   * that matches the system number produces no movement at all.
   */
  async approve(id: string, input: StocktakeActionDto, context: StocktakeContext): Promise<StocktakeDetail> {
    return this.command(`approve:${id}`, { expectedVersion: input.expectedVersion }, context, async tx => {
      const [hi, lo] = advisoryLockIdKey('stocktake-session', id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const row = await tx.stocktake.findUnique({ where: { id }, include: { items: true } });
      if (!row) throw missing();
      if (row.status !== 'REVIEW') throw stateConflict('Only a reviewed stocktake can be approved.');
      if (row.version !== input.expectedVersion) throw versionConflict();
      if (!row.items.length) throw new ConflictException({ code: 'STOCKTAKE_LINE_REQUIRED', message: 'Stocktake has no count lines.' });
      if (row.items.some(item => item.countedQty === null)) {
        throw new ConflictException({ code: 'STOCKTAKE_NOT_FULLY_COUNTED', message: 'Every line must be counted before approval.' });
      }
      const changedLines = row.items.length;
      let adjustedLines = 0;
      for (const item of row.items) {
        const [bhi, blo] = advisoryLockIdKey('balance', row.warehouseId, item.locationId, item.variantId);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${bhi}::int, ${blo}::int)`;
        const key = { warehouseId_locationId_variantId: { warehouseId: row.warehouseId, locationId: item.locationId, variantId: item.variantId } };
        const current = await tx.inventoryBalance.findUnique({ where: key });
        const beforeOnHand = current?.onHand ?? 0;
        const reserved = current?.reserved ?? 0;
        const countedQty = item.countedQty!;
        if (countedQty < reserved) {
          throw new ConflictException({ code: 'STOCKTAKE_RESERVED_EXCEEDS_COUNT', message: 'Counted quantity is lower than reserved stock; reservations must be released first.' });
        }
        const available = countedQty - reserved;
        if (countedQty > MAX_QTY || available > MAX_QTY) {
          throw new ConflictException({ code: 'INVENTORY_OVERFLOW', message: 'Counted quantity exceeds supported inventory quantity.' });
        }
        const delta = countedQty - beforeOnHand;
        let movementId: string | null = null;
        if (delta !== 0) {
          const movement = await tx.inventoryMovement.create({ data: { warehouseId: row.warehouseId, locationId: item.locationId,
            variantId: item.variantId, type: 'STOCKTAKE', quantity: delta, beforeOnHand, afterOnHand: countedQty,
            referenceType: 'StocktakeItem', referenceId: item.id } });
          movementId = movement.id;
          adjustedLines += 1;
          await this.audit.record({ action: 'inventory.balance.changed', entityType: 'inventory-movement', entityId: movement.id,
            actorId: context.actorId, requestId: context.requestId,
            metadata: { type: 'STOCKTAKE', stocktakeId: id, warehouseId: row.warehouseId, locationId: item.locationId,
              variantId: item.variantId, quantity: delta, beforeOnHand, afterOnHand: countedQty } }, tx);
        }
        await tx.inventoryBalance.upsert({ where: key, create: { warehouseId: row.warehouseId, locationId: item.locationId,
          variantId: item.variantId, onHand: countedQty, reserved, available, version: 1 },
        update: { onHand: countedQty, available, version: { increment: 1 } } });
        await tx.stocktakeItem.update({ where: { id: item.id }, data: { movementId } });
      }
      const updated = await tx.stocktake.updateMany({ where: { id, version: input.expectedVersion, status: 'REVIEW' },
        data: { status: 'COMPLETED', completedAt: new Date(), approvedById: context.actorId, version: { increment: 1 } } });
      if (updated.count !== 1) throw versionConflict();
      const changed = changedLines;
      await this.audit.record({ action: 'stocktake.approved', entityType: 'Stocktake', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { lineCount: changed, adjustedLines,
          netDifference: row.items.reduce((total, item) => total + (item.difference ?? 0), 0),
          from: 'REVIEW', to: 'COMPLETED', fromVersion: row.version, toVersion: row.version + 1 } }, tx);
      return id;
    }, async (tx, target) => this.toDetail(await this.load(tx, target), context.canApprove));
  }

  async cancel(id: string, input: StocktakeActionDto, context: StocktakeContext): Promise<StocktakeDetail> {
    return this.command(`cancel:${id}`, { expectedVersion: input.expectedVersion }, context, async tx => {
      const [hi, lo] = advisoryLockIdKey('stocktake-session', id);
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
      const row = await tx.stocktake.findUnique({ where: { id } });
      if (!row) throw missing();
      if (row.status === 'COMPLETED' || row.status === 'CANCELLED') {
        throw stateConflict('A finished stocktake cannot be cancelled.');
      }
      if (row.version !== input.expectedVersion) throw versionConflict();
      const updated = await tx.stocktake.updateMany({ where: { id, version: input.expectedVersion, status: row.status },
        data: { status: 'CANCELLED', cancelledAt: new Date(), version: { increment: 1 } } });
      if (updated.count !== 1) throw versionConflict();
      await this.audit.record({ action: 'stocktake.cancelled', entityType: 'Stocktake', entityId: id,
        actorId: context.actorId, requestId: context.requestId,
        metadata: { from: row.status, to: 'CANCELLED', fromVersion: row.version, toVersion: row.version + 1 } }, tx);
      return id;
    }, async (tx, target) => this.toDetail(await this.load(tx, target), context.canApprove));
  }

  private async load(tx: Prisma.TransactionClient, id: string): Promise<DetailRow> {
    const row = await tx.stocktake.findUnique({ where: { id }, include: detailInclude });
    if (!row) throw missing();
    return row;
  }

  private async scopeBalances(tx: Prisma.TransactionClient, row: { warehouseId: string; scopeType: 'WAREHOUSE' | 'LOCATIONS' | 'VARIANTS'; scope: Prisma.JsonValue }): Promise<{ locationId: string; variantId: string; onHand: number }[]> {
    const scope = this.scopeFilter(row);
    return tx.inventoryBalance.findMany({ where: { warehouseId: row.warehouseId, ...scope,
      OR: [{ onHand: { gt: 0 } }, { reserved: { gt: 0 } }] },
    select: { locationId: true, variantId: true, onHand: true },
    orderBy: [{ locationId: 'asc' }, { variantId: 'asc' }] });
  }

  /**
   * The scope ids were pinned when the stocktake was created, so the count sheet
   * is built from exactly that scope and cannot widen or narrow later.
   */
  private scopeFilter(row: { scopeType: 'WAREHOUSE' | 'LOCATIONS' | 'VARIANTS'; scope: Prisma.JsonValue }): { locationId?: { in: string[] }; variantId?: { in: string[] } } {
    if (row.scopeType === 'WAREHOUSE') return {};
    const pinned = (row.scope ?? {}) as { locationIds?: unknown; variantIds?: unknown };
    if (row.scopeType === 'LOCATIONS') return { locationId: { in: asIds(pinned.locationIds) } };
    return { variantId: { in: asIds(pinned.variantIds) } };
  }

  private normalizeCounts(lines: StocktakeLineInput[]): StocktakeLineInput[] {
    if (!Array.isArray(lines) || lines.length < 1 || lines.length > 500) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'A count needs 1–500 lines.' });
    }
    const seen = new Set<string>();
    return lines.map(line => {
      const key = `${line.locationId}\u0000${line.variantId}`;
      if (seen.has(key)) throw new BadRequestException({ code: 'STOCKTAKE_LINE_CONFLICT', message: 'Duplicate count line for the same location and SKU.' });
      seen.add(key);
      if (!Number.isInteger(line.countedQty) || line.countedQty < 0 || line.countedQty > MAX_QTY) {
        throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Counted quantity must be a whole number between 0 and 2,000,000,000.' });
      }
      return { locationId: line.locationId, variantId: line.variantId, countedQty: line.countedQty, notes: line.notes ?? null };
    }).sort((a, b) => a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0);
  }

  private async command<T>(scope: string, payload: unknown, context: StocktakeContext,
    execute: (tx: Prisma.TransactionClient) => Promise<T>,
    project: (tx: Prisma.TransactionClient, result: T) => Promise<StocktakeDetail>): Promise<StocktakeDetail> {
    if (!keyPattern.test(context.idempotencyKey ?? '')) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Idempotency-Key must contain 8–96 ASCII letters, digits, underscores or hyphens.' });
    }
    const keyHash = hash(context.idempotencyKey);
    const payloadHash = hash(stableJson(payload));
    const key = { actorId: context.actorId, scope, keyHash };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async tx => {
          const [hi, lo] = advisoryLockIdKey('stocktake-command', context.actorId, scope, keyHash);
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
          const prior = await tx.stocktakeCommandRecord.findUnique({ where: { actorId_scope_keyHash: key } });
          if (prior) {
            if (prior.payloadHash !== payloadHash) throw new ConflictException({ code: 'IDEMPOTENCY_CONFLICT', message: 'Key reused with another stocktake command.' });
            if (prior.response === null) throw new ConflictException({ code: 'CONFLICT', message: 'Command is still committing.' });
            return prior.response as unknown as StocktakeDetail;
          }
          const record = await tx.stocktakeCommandRecord.create({ data: { ...key, payloadHash } });
          const result = await execute(tx);
          const response = await project(tx, result);
          await tx.stocktakeCommandRecord.update({ where: { id: record.id }, data: { response: response as unknown as Prisma.InputJsonValue } });
          return response;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 3) { await sleep(retryDelayMs(attempt)); continue; }
          throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Concurrent stocktake command; retry with the same key.' });
        }
        throw error;
      }
    }
    throw new ConflictException({ code: 'RETRYABLE_CONFLICT', message: 'Stocktake command could not be committed.' });
  }
}

const unique = (values: string[] | undefined): string[] => [...new Set(values ?? [])];
const asIds = (value: unknown): string[] => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);
