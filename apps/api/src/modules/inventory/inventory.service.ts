import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InventoryMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AuditLogService } from '../audit/audit-log.service';

type StockKey = {
  warehouseId: string;
  locationId: string;
  variantId: string;
};

export type ActorContext = {
  actorId: string;
  requestId: string;
};

export type ChangeStockCommand = StockKey &
  ActorContext & {
    delta: number;
    type: InventoryMovementType;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
    idempotencyKey?: string;
    expectedVersion?: number;
  };

export type ReserveStockCommand = StockKey &
  ActorContext & {
    orderId?: string | null;
    quantity: number;
    expiresAt: Date;
    expectedVersion?: number;
  };

export type ReservationLifecycleContext = ActorContext & {
  expectedVersion?: number;
};

export type InventorySnapshotDto = {
  warehouseId: string;
  locationId: string;
  variantId: string;
  onHand: number;
  reserved: number;
  available: number;
  version: number;
};

export type InventoryMovementDto = {
  id: string;
  type: InventoryMovementType;
  quantity: number;
  beforeOnHand: number;
  afterOnHand: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: Date;
};

export type SnapshotQuery = {
  warehouseId?: string;
  locationId?: string;
  variantId?: string;
  limit?: number;
  offset?: number;
};

export type MovementQuery = {
  warehouseId?: string;
  locationId?: string;
  variantId?: string;
  type?: InventoryMovementType;
  limit?: number;
  offset?: number;
};

const SERIALIZABLE_RETRIES = 3;
const EXPIRY_BATCH_SIZE = 100;
const MAX_OFFSET = 50_000;
const ADJUSTMENT_TYPES = new Set<InventoryMovementType>([
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async changeOnHand(command: ChangeStockCommand) {
    this.assertTracked(command);
    if (!Number.isInteger(command.delta) || command.delta === 0) {
      throw new BadRequestException('Inventory delta must be a non-zero integer.');
    }
    if (ADJUSTMENT_TYPES.has(command.type) && !command.reason?.trim()) {
      throw new BadRequestException('Manual corrections require a reason.');
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (command.idempotencyKey) {
            const existing = await tx.inventoryMovement.findUnique({
              where: { idempotencyKey: command.idempotencyKey },
            });
            if (existing) {
              if (this.movementMatches(existing, command)) return existing;
              throw new ConflictException(
                `Idempotency conflict: key '${command.idempotencyKey}' was already used with a different payload.`,
              );
            }
          }

          await this.assertLocation(tx, command);

          const key = this.balanceKey(command);
          const current = await tx.inventoryBalance.findUnique({ where: key });
          const version = current?.version ?? 0;
          this.assertVersion(command.expectedVersion, version);

          const beforeOnHand = current?.onHand ?? 0;
          const reserved = current?.reserved ?? 0;
          const afterOnHand = beforeOnHand + command.delta;
          const available = afterOnHand - reserved;

          if (afterOnHand < 0 || available < 0) {
            throw new ConflictException('Insufficient stock for this operation.');
          }

          await tx.inventoryBalance.upsert({
            where: key,
            create: {
              warehouseId: command.warehouseId,
              locationId: command.locationId,
              variantId: command.variantId,
              onHand: afterOnHand,
              reserved,
              available,
              version: 1,
            },
            update: {
              onHand: afterOnHand,
              available,
              version: { increment: 1 },
            },
          });

          const movement = await tx.inventoryMovement.create({
            data: {
              warehouseId: command.warehouseId,
              locationId: command.locationId,
              variantId: command.variantId,
              type: command.type,
              quantity: command.delta,
              beforeOnHand,
              afterOnHand,
              reason: command.reason,
              referenceType: command.referenceType,
              referenceId: command.referenceId,
              idempotencyKey: command.idempotencyKey,
            },
          });

          await this.auditLog.record(
            {
              action: 'inventory.balance.changed',
              entityType: 'inventory-movement',
              entityId: movement.id,
              before: { onHand: beforeOnHand, reserved },
              after: { onHand: afterOnHand, available },
              metadata: { type: command.type, warehouseId: command.warehouseId, locationId: command.locationId },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return movement;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async reserve(command: ReserveStockCommand) {
    this.assertTracked(command);
    if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new BadRequestException('Reservation quantity must be a positive integer.');
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.assertLocation(tx, command);
          const key = this.balanceKey(command);
          const balance = await tx.inventoryBalance.findUnique({ where: key });
          const version = balance?.version ?? 0;
          this.assertVersion(command.expectedVersion, version);

          if (!balance || balance.available < command.quantity) {
            throw new ConflictException('Insufficient available stock.');
          }

          await tx.inventoryBalance.update({
            where: key,
            data: {
              reserved: { increment: command.quantity },
              available: { decrement: command.quantity },
              version: { increment: 1 },
            },
          });

          const reservation = await tx.stockReservation.create({
            data: {
              warehouseId: command.warehouseId,
              locationId: command.locationId,
              variantId: command.variantId,
              orderId: command.orderId ?? null,
              quantity: command.quantity,
              expiresAt: command.expiresAt,
            },
          });

          await this.auditLog.record(
            {
              action: 'inventory.reservation.created',
              entityType: 'stock-reservation',
              entityId: reservation.id,
              before: { reserved: balance.reserved, available: balance.available },
              after: {
                reserved: balance.reserved + command.quantity,
                available: balance.available - command.quantity,
              },
              metadata: { warehouseId: command.warehouseId, locationId: command.locationId },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return reservation;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async releaseReservation(reservationId: string, context: ReservationLifecycleContext) {
    this.assertTracked(context);
    const reservation = await this.requireActiveReservation(reservationId);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const recheck = await tx.stockReservation.findUnique({ where: { id: reservationId } });
          if (!recheck || recheck.status !== 'ACTIVE') {
            return recheck ?? reservation;
          }

          const balance = await tx.inventoryBalance.findUnique({ where: { id: reservation.balanceId } });
          this.assertVersion(context.expectedVersion, balance?.version ?? 0);
          if (!balance || balance.reserved < reservation.quantity) {
            throw new ConflictException('Reservation balance is inconsistent.');
          }

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              reserved: { decrement: reservation.quantity },
              available: { increment: reservation.quantity },
              version: { increment: 1 },
            },
          });

          const released = await tx.stockReservation.update({
            where: { id: reservationId },
            data: { status: 'RELEASED' },
          });

          await this.auditLog.record(
            {
              action: 'inventory.reservation.released',
              entityType: 'stock-reservation',
              entityId: reservationId,
              before: { reserved: balance.reserved, available: balance.available },
              after: { reserved: balance.reserved - reservation.quantity, available: balance.available + reservation.quantity },
              actorId: context.actorId,
              requestId: context.requestId,
            },
            tx,
          );

          return released;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async consumeReservation(reservationId: string, context: ReservationLifecycleContext) {
    this.assertTracked(context);
    const reservation = await this.requireActiveReservation(reservationId);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const recheck = await tx.stockReservation.findUnique({ where: { id: reservationId } });
          if (!recheck || recheck.status !== 'ACTIVE') {
            return recheck ?? reservation;
          }

          const balance = await tx.inventoryBalance.findUnique({ where: { id: reservation.balanceId } });
          this.assertVersion(context.expectedVersion, balance?.version ?? 0);
          if (!balance || balance.reserved < reservation.quantity) {
            throw new ConflictException('Reservation balance is inconsistent.');
          }

          const beforeOnHand = balance.onHand;
          const afterReserved = balance.reserved - reservation.quantity;
          const afterOnHand = balance.onHand - reservation.quantity;
          const available = afterOnHand - afterReserved;

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              onHand: afterOnHand,
              reserved: afterReserved,
              available,
              version: { increment: 1 },
            },
          });

          await tx.inventoryMovement.create({
            data: {
              warehouseId: reservation.warehouseId,
              locationId: reservation.locationId,
              variantId: reservation.variantId,
              type: InventoryMovementType.SALE,
              quantity: -reservation.quantity,
              beforeOnHand,
              afterOnHand,
              referenceType: reservation.orderId ? 'order' : 'stock-reservation',
              referenceId: reservation.orderId ?? reservationId,
              reason: 'Reservation consumed',
            },
          });

          const consumed = await tx.stockReservation.update({
            where: { id: reservationId },
            data: { status: 'CONSUMED' },
          });

          await this.auditLog.record(
            {
              action: 'inventory.reservation.consumed',
              entityType: 'stock-reservation',
              entityId: reservationId,
              before: { onHand: beforeOnHand, reserved: balance.reserved },
              after: { onHand: afterOnHand, reserved: afterReserved, available },
              metadata: { orderId: reservation.orderId },
              actorId: context.actorId,
              requestId: context.requestId,
            },
            tx,
          );

          return consumed;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async expireReservations(context: ActorContext, options: { now?: Date; batchSize?: number } = {}) {
    this.assertTracked(context);
    const now = options.now ?? new Date();
    const batchSize = clampInt(options.batchSize, 1, 100, EXPIRY_BATCH_SIZE);
    const reservations = await this.prisma.stockReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      take: batchSize,
      orderBy: [{ expiresAt: 'asc' }, { id: 'asc' }],
    });

    let expired = 0;
    for (const reservation of reservations) {
      expired += await this.expireSingleReservation(reservation.id, reservation.quantity, context);
    }
    return expired;
  }

  async getSnapshots(query: SnapshotQuery): Promise<{ items: InventorySnapshotDto[]; count: number }> {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);

    const where: Prisma.InventoryBalanceWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
    };

    const [rows, count] = await Promise.all([
      this.prisma.inventoryBalance.findMany({
        where,
        orderBy: [{ warehouseId: 'asc' }, { locationId: 'asc' }, { variantId: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.inventoryBalance.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        warehouseId: row.warehouseId,
        locationId: row.locationId,
        variantId: row.variantId,
        onHand: row.onHand,
        reserved: row.reserved,
        available: row.available,
        version: row.version,
      })),
      count,
    };
  }

  async getMovements(query: MovementQuery): Promise<{ items: InventoryMovementDto[]; count: number }> {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);

    const where: Prisma.InventoryMovementWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [rows, count] = await Promise.all([
      this.prisma.inventoryMovement.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        type: row.type,
        quantity: row.quantity,
        beforeOnHand: row.beforeOnHand,
        afterOnHand: row.afterOnHand,
        reason: row.reason,
        referenceType: row.referenceType,
        referenceId: row.referenceId,
        createdAt: row.createdAt,
      })),
      count,
    };
  }

  private assertTracked(context: { actorId?: string | null; requestId?: string | null }): void {
    if (!context.actorId?.trim() || !context.requestId?.trim()) {
      throw new BadRequestException('actorId and requestId are required for inventory mutations.');
    }
  }

  private async requireActiveReservation(reservationId: string) {
    const reservation = await this.prisma.stockReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) throw new NotFoundException('Reservation not found.');

    const balance = await this.prisma.inventoryBalance.findUnique({
      where: this.balanceKey({
        warehouseId: reservation.warehouseId,
        locationId: reservation.locationId,
        variantId: reservation.variantId,
      }),
    });
    if (!balance) throw new ConflictException('Reservation balance is missing.');

    return { ...reservation, balanceId: balance.id };
  }

  private async expireSingleReservation(
    reservationId: string,
    quantity: number,
    context: ActorContext,
  ): Promise<number> {
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const reservation = await tx.stockReservation.findUnique({ where: { id: reservationId } });
          if (!reservation) return 0;
          if (reservation.status !== 'ACTIVE') return 0;

          const balance = await tx.inventoryBalance.findUnique({
            where: this.balanceKey({
              warehouseId: reservation.warehouseId,
              locationId: reservation.locationId,
              variantId: reservation.variantId,
            }),
          });
          if (!balance || balance.reserved < quantity) {
            throw new ConflictException('Reservation balance is inconsistent.');
          }

          await tx.inventoryBalance.update({
            where: { id: balance.id },
            data: {
              reserved: { decrement: quantity },
              available: { increment: quantity },
              version: { increment: 1 },
            },
          });

          await tx.stockReservation.update({
            where: { id: reservationId },
            data: { status: 'EXPIRED' },
          });

          await this.auditLog.record(
            {
              action: 'inventory.reservation.expired',
              entityType: 'stock-reservation',
              entityId: reservationId,
              before: { reserved: balance.reserved, available: balance.available },
              after: { reserved: balance.reserved - quantity, available: balance.available + quantity },
              actorId: context.actorId,
              requestId: context.requestId,
            },
            tx,
          );

          return 1;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private balanceKey(key: StockKey) {
    return {
      warehouseId_locationId_variantId: {
        warehouseId: key.warehouseId,
        locationId: key.locationId,
        variantId: key.variantId,
      },
    } as const;
  }

  private async assertLocation(tx: Prisma.TransactionClient, key: StockKey) {
    const location = await tx.warehouseLocation.findFirst({
      where: { id: key.locationId, warehouseId: key.warehouseId, isActive: true },
      select: { id: true },
    });
    if (!location) throw new NotFoundException('Active warehouse location not found.');
  }

  private assertVersion(expected: number | undefined, actual: number): void {
    if (expected !== undefined && actual !== expected) {
      throw new ConflictException('Inventory balance version conflict. Refresh and retry.');
    }
  }

  private movementMatches(
    movement: { warehouseId: string; locationId: string; variantId: string; type: string; quantity: number; reason: string | null; referenceType: string | null; referenceId: string | null },
    command: ChangeStockCommand,
  ): boolean {
    return (
      movement.warehouseId === command.warehouseId &&
      movement.locationId === command.locationId &&
      movement.variantId === command.variantId &&
      movement.type === command.type &&
      movement.quantity === command.delta &&
      (movement.reason ?? null) === (command.reason ?? null) &&
      (movement.referenceType ?? null) === (command.referenceType ?? null) &&
      (movement.referenceId ?? null) === (command.referenceId ?? null)
    );
  }

  private async withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (
          attempt < SERIALIZABLE_RETRIES - 1 &&
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error as { code?: unknown }).code === 'P2034'
        ) {
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}