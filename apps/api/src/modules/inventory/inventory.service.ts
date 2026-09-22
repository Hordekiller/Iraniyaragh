import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InventoryMovementType, Prisma } from "@prisma/client";
import {
  type InventoryBalanceListResponse,
  type InventoryBalanceSnapshot,
  type InventoryChangeType,
  type InventoryMovement as InventoryMovementContract,
  type InventoryMovementListResponse,
  type StockTransfer,
} from "@iranyaragh/contracts";
import { PrismaService } from "../../database/prisma.service";
import { retryDelayMs, sleep } from "../../common/retry";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import { AuditLogService } from "../audit/audit-log.service";
import {
  INVENTORY_CHANGE_TYPES,
  MAX_TRANSFER_ITEMS,
} from "./inventory.constants";

type StockKey = {
  warehouseId: string;
  locationId: string;
  variantId: string;
};

type StockReservationRow = Prisma.StockReservationGetPayload<
  Record<string, never>
>;

type ActiveReservation = StockReservationRow & { balanceId: string };

type ActiveBalance = Prisma.InventoryBalanceGetPayload<Record<string, never>>;

type TransferItemRowLike = {
  id: string;
  variantId: string;
  quantity: number;
  sourceLocationId: string | null;
  targetLocationId: string | null;
};

type TransferRowLike = {
  id: string;
  code: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  status: StockTransfer["status"];
  version: number;
  items: TransferItemRowLike[];
  createdAt: Date;
  updatedAt: Date;
};

type StockTransferRowLike = TransferRowLike & {
  idempotencyKey: string | null;
};

export type ActorContext = {
  actorId: string;
  requestId: string;
};

export type ChangeStockCommand = StockKey &
  ActorContext & {
    delta: number;
    type: InventoryChangeType;
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
    idempotencyKey?: string;
  };

export type ReservationLifecycleContext = ActorContext & {
  expectedVersion?: number;
};

export type WarehouseCreateCommand = ActorContext & {
  code: string;
  name: string;
  city?: string;
  address?: string;
};

export type WarehouseUpdateCommand = ActorContext & {
  name?: string;
  city?: string;
  address?: string;
  isActive?: boolean;
};

export type LocationCreateCommand = ActorContext & {
  code: string;
  name?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
};

export type LocationUpdateCommand = ActorContext & {
  name?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
  isActive?: boolean;
};

export type TransferItemCommand = {
  variantId: string;
  quantity: number;
  sourceLocationId?: string;
  targetLocationId?: string;
};

export type CreateTransferCommand = ActorContext & {
  code?: string;
  sourceWarehouseId: string;
  targetWarehouseId: string;
  items: TransferItemCommand[];
  idempotencyKey?: string;
};

export type TransferContext = ActorContext & {
  expectedVersion?: number;
  idempotencyKey?: string;
};

export type WarehouseQuery = {
  isActive?: boolean;
  isInactive?: boolean;
  limit?: number;
  offset?: number;
};

export type ReservationQuery = {
  warehouseId?: string;
  variantId?: string;
  status?: string;
  limit?: number;
  offset?: number;
};

export type TransferQuery = {
  status?: string;
  sourceWarehouseId?: string;
  targetWarehouseId?: string;
  limit?: number;
  offset?: number;
};

export type InventorySnapshotDto = InventoryBalanceSnapshot;

export type InventoryMovementDto = InventoryMovementContract;

export type TransferItemDto = {
  id: string;
  variantId: string;
  quantity: number;
  sourceLocationId: string | null;
  targetLocationId: string | null;
};

export type TransferDto = StockTransfer;

export type WarehouseDto = {
  id: string;
  code: string;
  name: string;
  city: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type LocationDto = {
  id: string;
  warehouseId: string;
  code: string;
  name: string | null;
  zone: string | null;
  aisle: string | null;
  rack: string | null;
  shelf: string | null;
  bin: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
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
const INVENTORY_CHANGE_TYPE_SET = new Set<InventoryMovementType>(
  INVENTORY_CHANGE_TYPES,
);
const ADJUSTMENT_TYPES = new Set<InventoryMovementType>([
  InventoryMovementType.ADJUSTMENT_IN,
  InventoryMovementType.ADJUSTMENT_OUT,
]);

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
  ) {}

  async changeOnHand(
    command: ChangeStockCommand,
  ): Promise<InventoryMovementDto> {
    this.assertTracked(command);
    if (!Number.isInteger(command.delta) || command.delta === 0) {
      throw new BadRequestException(
        "Inventory delta must be a non-zero integer.",
      );
    }
    if (!INVENTORY_CHANGE_TYPE_SET.has(command.type)) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        message: "This endpoint only accepts receipts and manual adjustments.",
      });
    }
    const isOutboundAdjustment =
      command.type === InventoryMovementType.ADJUSTMENT_OUT;
    if (
      (isOutboundAdjustment && command.delta > 0) ||
      (!isOutboundAdjustment && command.delta < 0)
    ) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        message: "Inventory movement type and delta direction do not match.",
      });
    }
    if (ADJUSTMENT_TYPES.has(command.type) && !command.reason?.trim()) {
      throw new BadRequestException("Manual corrections require a reason.");
    }

    const movement = await this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.acquireBalanceLock(tx, command);

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

          await this.assertStockIdentity(tx, command);

          const key = this.balanceKey(command);
          const current = await tx.inventoryBalance.findUnique({ where: key });
          const version = current?.version ?? 0;
          this.assertVersion(command.expectedVersion, version);

          const beforeOnHand = current?.onHand ?? 0;
          const reserved = current?.reserved ?? 0;
          const afterOnHand = beforeOnHand + command.delta;
          const available = afterOnHand - reserved;

          if (afterOnHand < 0 || available < 0) {
            throw new ConflictException({
              code: "INSUFFICIENT_STOCK",
              message: "Insufficient stock for this operation.",
            });
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
              action: "inventory.balance.changed",
              entityType: "inventory-movement",
              entityId: movement.id,
              before: { onHand: beforeOnHand, reserved },
              after: { onHand: afterOnHand, available },
              metadata: {
                type: command.type,
                warehouseId: command.warehouseId,
                locationId: command.locationId,
              },
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
    return this.toMovementDto(movement);
  }

  async reserve(command: ReserveStockCommand) {
    this.assertTracked(command);
    if (!Number.isInteger(command.quantity) || command.quantity <= 0) {
      throw new BadRequestException(
        "Reservation quantity must be a positive integer.",
      );
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.acquireBalanceLock(tx, command);

          if (command.idempotencyKey) {
            const existing = await tx.stockReservation.findUnique({
              where: { idempotencyKey: command.idempotencyKey },
            });
            if (existing) {
              if (this.reservationMatches(existing, command)) return existing;
              throw new ConflictException(
                `Idempotency conflict: key '${command.idempotencyKey}' was already used with a different payload.`,
              );
            }
          }

          await this.assertStockIdentity(tx, command);
          const key = this.balanceKey(command);
          const balance = await tx.inventoryBalance.findUnique({ where: key });
          const version = balance?.version ?? 0;
          this.assertVersion(command.expectedVersion, version);

          if (!balance || balance.available < command.quantity) {
            throw new ConflictException({
              code: "INSUFFICIENT_STOCK",
              message: "Insufficient available stock.",
            });
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
              idempotencyKey: command.idempotencyKey,
            },
          });

          await this.auditLog.record(
            {
              action: "inventory.reservation.created",
              entityType: "stock-reservation",
              entityId: reservation.id,
              before: {
                reserved: balance.reserved,
                available: balance.available,
              },
              after: {
                reserved: balance.reserved + command.quantity,
                available: balance.available - command.quantity,
              },
              metadata: {
                warehouseId: command.warehouseId,
                locationId: command.locationId,
              },
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

  async releaseReservation(
    reservationId: string,
    context: ReservationLifecycleContext,
  ) {
    return this.transitionReservation(
      reservationId,
      context,
      async (tx, reservation, balance) => {
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
          data: { status: "RELEASED" },
        });

        await this.auditLog.record(
          {
            action: "inventory.reservation.released",
            entityType: "stock-reservation",
            entityId: reservationId,
            before: {
              reserved: balance.reserved,
              available: balance.available,
            },
            after: {
              reserved: balance.reserved - reservation.quantity,
              available: balance.available + reservation.quantity,
            },
            actorId: context.actorId,
            requestId: context.requestId,
          },
          tx,
        );

        return released;
      },
    );
  }

  async consumeReservation(
    reservationId: string,
    context: ReservationLifecycleContext,
  ) {
    return this.transitionReservation(
      reservationId,
      context,
      async (tx, reservation, balance) => {
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
            referenceType: reservation.orderId ? "order" : "stock-reservation",
            referenceId: reservation.orderId ?? reservationId,
            reason: "Reservation consumed",
          },
        });

        const consumed = await tx.stockReservation.update({
          where: { id: reservationId },
          data: { status: "CONSUMED" },
        });

        await this.auditLog.record(
          {
            action: "inventory.reservation.consumed",
            entityType: "stock-reservation",
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
    );
  }

  private async transitionReservation<R extends { id: string; status: string }>(
    reservationId: string,
    context: ReservationLifecycleContext,
    apply: (
      tx: Prisma.TransactionClient,
      reservation: ActiveReservation,
      balance: ActiveBalance,
    ) => Promise<R>,
  ): Promise<R | StockReservationRow> {
    this.assertTracked(context);
    const reservation = await this.requireActiveReservation(reservationId);

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          await this.acquireBalanceLock(tx, reservation);

          const recheck = await tx.stockReservation.findUnique({
            where: { id: reservationId },
          });
          const replayState = this.reservationReplay(recheck, reservation);
          if (replayState !== null) {
            return replayState;
          }

          const balance = await tx.inventoryBalance.findUnique({
            where: { id: reservation.balanceId },
          });
          this.assertVersion(context.expectedVersion, balance?.version ?? 0);
          if (!balance || balance.reserved < reservation.quantity) {
            throw new ConflictException({
              code: "RESERVATION_STATE_CONFLICT",
              message: "Reservation balance is inconsistent.",
            });
          }

          return apply(tx, reservation, balance);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async expireReservations(
    context: ActorContext,
    options: { now?: Date; batchSize?: number } = {},
  ) {
    this.assertTracked(context);
    const now = options.now ?? new Date();
    const batchSize = clampInt(options.batchSize, 1, 100, EXPIRY_BATCH_SIZE);
    const reservations = await this.prisma.stockReservation.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      take: batchSize,
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
    });

    if (!reservations.length) return 0;

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          let expired = 0;
          for (const candidate of reservations) {
            expired += await this.expireSingleReservation(
              tx,
              candidate.id,
              context,
            );
          }
          return expired;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async releaseReservationsForOrder(
    tx: Prisma.TransactionClient,
    orderId: string,
    context: ActorContext,
  ): Promise<number> {
    this.assertTracked(context);
    const reservations = await tx.stockReservation.findMany({
      where: { orderId, status: "ACTIVE" },
      orderBy: [{ id: "asc" }],
    });

    let released = 0;
    for (const reservation of reservations) {
      released += await this.releaseSingleReservation(tx, reservation, context);
    }
    return released;
  }

  async getSnapshots(
    query: SnapshotQuery,
  ): Promise<InventoryBalanceListResponse> {
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
        orderBy: [
          { warehouseId: "asc" },
          { locationId: "asc" },
          { variantId: "asc" },
        ],
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

  async getPublicAvailability(variantIds: string[]) {
    const ids = [...new Set(variantIds)].slice(0, 100);
    if (!ids.length) return { items: [] };
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: ids }, status: "ACTIVE" },
      select: { id: true },
    });
    const balances = await this.prisma.inventoryBalance.findMany({
      where: { variantId: { in: variants.map((v) => v.id) } },
      select: { variantId: true, available: true },
    });
    const totals = new Map<string, number>();
    for (const balance of balances)
      totals.set(
        balance.variantId,
        (totals.get(balance.variantId) ?? 0) + balance.available,
      );
    return {
      items: ids.map((variantId) => {
        if (!variants.some((variant) => variant.id === variantId))
          return { variantId, status: "UNKNOWN" as const };
        const available = totals.get(variantId) ?? 0;
        return {
          variantId,
          status:
            available <= 0
              ? ("OUT_OF_STOCK" as const)
              : available <= 5
                ? ("LOW_STOCK" as const)
                : ("IN_STOCK" as const),
        };
      }),
    };
  }

  async getMovements(
    query: MovementQuery,
  ): Promise<InventoryMovementListResponse> {
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
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);

    return {
      items: rows.map((row) => this.toMovementDto(row)),
      count,
    };
  }

  async getTransfers(
    query: TransferQuery,
  ): Promise<{ items: TransferDto[]; count: number }> {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);

    const where: Prisma.StockTransferWhereInput = {
      ...(query.status
        ? { status: query.status as Prisma.EnumTransferStatusFilter }
        : {}),
      ...(query.sourceWarehouseId
        ? { sourceWarehouseId: query.sourceWarehouseId }
        : {}),
      ...(query.targetWarehouseId
        ? { targetWarehouseId: query.targetWarehouseId }
        : {}),
    };

    const [rows, count] = await Promise.all([
      this.prisma.stockTransfer.findMany({
        where,
        include: { items: true },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.stockTransfer.count({ where }),
    ]);

    return {
      items: rows.map((transfer) => this.toTransferDto(transfer)),
      count,
    };
  }

  async getTransfer(id: string): Promise<TransferDto> {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) {
      throw new NotFoundException({
        code: "TRANSFER_NOT_FOUND",
        message: "Transfer not found.",
      });
    }
    return this.toTransferDto(transfer);
  }

  async createTransfer(command: CreateTransferCommand): Promise<TransferDto> {
    this.assertTracked(command);
    if (!command.items.length) {
      throw new BadRequestException({
        code: "TRANSFER_NO_ITEMS",
        message: "A transfer requires at least one item.",
      });
    }
    if (command.items.length > MAX_TRANSFER_ITEMS) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        message: `A transfer cannot contain more than ${MAX_TRANSFER_ITEMS} items.`,
      });
    }
    if (
      command.items.some(
        (item) => !Number.isInteger(item.quantity) || item.quantity <= 0,
      )
    ) {
      throw new BadRequestException({
        code: "INVALID_REQUEST",
        message: "Transfer item quantity must be greater than zero.",
      });
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          if (command.idempotencyKey) {
            const existing = await tx.stockTransfer.findUnique({
              where: { idempotencyKey: command.idempotencyKey },
              include: { items: true },
            });
            if (existing) {
              if (this.transferMatches(existing, command))
                return this.toTransferDto(existing);
              throw new ConflictException(
                `Idempotency conflict: key '${command.idempotencyKey}' was already used with a different payload.`,
              );
            }
          }

          await this.assertWarehousePair(
            tx,
            command.sourceWarehouseId,
            command.targetWarehouseId,
          );
          await this.assertVariants(
            tx,
            command.items.map(({ variantId }) => variantId),
          );

          const code =
            command.code?.trim() ||
            `TRF-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;
          const transfer = await tx.stockTransfer.create({
            data: {
              code,
              sourceWarehouseId: command.sourceWarehouseId,
              targetWarehouseId: command.targetWarehouseId,
              idempotencyKey: command.idempotencyKey,
              items: {
                create: command.items.map((item) => ({
                  variantId: item.variantId,
                  quantity: item.quantity,
                  sourceLocationId: item.sourceLocationId ?? null,
                  targetLocationId: item.targetLocationId ?? null,
                })),
              },
            },
            include: { items: true },
          });

          await this.auditLog.record(
            {
              action: "inventory.transfer.created",
              entityType: "stock-transfer",
              entityId: transfer.id,
              after: {
                code,
                sourceWarehouseId: transfer.sourceWarehouseId,
                targetWarehouseId: transfer.targetWarehouseId,
              },
              metadata: { itemCount: command.items.length },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return this.toTransferDto(transfer);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async requestTransfer(
    id: string,
    context: TransferContext,
  ): Promise<TransferDto> {
    return this.transitionTransfer("request", id, context, ["DRAFT"]);
  }

  async approveTransfer(
    id: string,
    context: TransferContext,
  ): Promise<TransferDto> {
    return this.transitionTransfer("approve", id, context, ["REQUESTED"]);
  }

  async dispatchTransfer(
    id: string,
    context: TransferContext,
  ): Promise<TransferDto> {
    return this.transitionTransfer("dispatch", id, context, ["APPROVED"]);
  }

  async receiveTransfer(
    id: string,
    context: TransferContext,
  ): Promise<TransferDto> {
    return this.transitionTransfer("receive", id, context, ["IN_TRANSIT"]);
  }

  async cancelTransfer(
    id: string,
    context: TransferContext,
  ): Promise<TransferDto> {
    return this.transitionTransfer("cancel", id, context, [
      "DRAFT",
      "REQUESTED",
      "APPROVED",
    ]);
  }

  async listWarehouses(
    query: WarehouseQuery,
  ): Promise<{ items: WarehouseDto[]; count: number }> {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);
    const activeOnly = query.isActive === true && query.isInactive !== true;
    const inactiveOnly = query.isInactive === true && query.isActive !== true;

    const where: Prisma.WarehouseWhereInput =
      activeOnly || inactiveOnly ? { isActive: activeOnly } : {};

    const [rows, count] = await Promise.all([
      this.prisma.warehouse.findMany({
        where,
        orderBy: [{ code: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.warehouse.count({ where }),
    ]);

    return { items: rows.map((row) => this.toWarehouseDto(row)), count };
  }

  async createWarehouse(
    command: WarehouseCreateCommand,
  ): Promise<WarehouseDto> {
    this.assertTracked(command);
    if (!command.code.trim()) {
      throw new BadRequestException("Warehouse code is required.");
    }

    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const normalizedCode = command.code.trim();
          const existing = await tx.warehouse.findUnique({
            where: { code: normalizedCode },
          });
          if (existing) {
            throw new ConflictException({
              code: "WAREHOUSE_CODE_CONFLICT",
              message: "Warehouse code already exists.",
            });
          }

          const warehouse = await tx.warehouse.create({
            data: {
              code: normalizedCode,
              name: command.name.trim(),
              city: command.city ?? null,
              address: command.address ?? null,
            },
          });

          await this.auditLog.record(
            {
              action: "inventory.warehouse.created",
              entityType: "warehouse",
              entityId: warehouse.id,
              after: { code: warehouse.code, name: warehouse.name },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return this.toWarehouseDto(warehouse);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async updateWarehouse(
    id: string,
    command: WarehouseUpdateCommand,
  ): Promise<WarehouseDto> {
    this.assertTracked(command);
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const warehouse = await tx.warehouse.findUnique({ where: { id } });
          if (!warehouse) {
            throw new NotFoundException({
              code: "WAREHOUSE_NOT_FOUND",
              message: "Warehouse not found.",
            });
          }

          const updated = await tx.warehouse.update({
            where: { id },
            data: {
              ...(command.name !== undefined
                ? { name: command.name.trim() }
                : {}),
              ...(command.city !== undefined ? { city: command.city } : {}),
              ...(command.address !== undefined
                ? { address: command.address }
                : {}),
              ...(command.isActive !== undefined
                ? { isActive: command.isActive }
                : {}),
            },
          });

          await this.auditLog.record(
            {
              action: "inventory.warehouse.updated",
              entityType: "warehouse",
              entityId: warehouse.id,
              before: {
                name: warehouse.name,
                city: warehouse.city,
                address: warehouse.address,
                isActive: warehouse.isActive,
              },
              after: {
                name: updated.name,
                city: updated.city,
                address: updated.address,
                isActive: updated.isActive,
              },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return this.toWarehouseDto(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async listLocations(
    warehouseId: string,
    query: WarehouseQuery,
  ): Promise<{ items: LocationDto[]; count: number }> {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);
    const activeOnly = query.isActive === true && query.isInactive !== true;
    const inactiveOnly = query.isInactive === true && query.isActive !== true;

    const where: Prisma.WarehouseLocationWhereInput = {
      warehouseId,
      ...(activeOnly || inactiveOnly ? { isActive: activeOnly } : {}),
    };

    const [rows, count] = await Promise.all([
      this.prisma.warehouseLocation.findMany({
        where,
        orderBy: [{ code: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.warehouseLocation.count({ where }),
    ]);

    return { items: rows.map((row) => this.toLocationDto(row)), count };
  }

  async createLocation(
    warehouseId: string,
    command: LocationCreateCommand,
  ): Promise<LocationDto> {
    this.assertTracked(command);
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const warehouse = await tx.warehouse.findUnique({
            where: { id: warehouseId },
          });
          if (!warehouse) {
            throw new NotFoundException({
              code: "WAREHOUSE_NOT_FOUND",
              message: "Warehouse not found.",
            });
          }

          const existing = await tx.warehouseLocation.findUnique({
            where: { warehouseId_code: { warehouseId, code: command.code } },
          });
          if (existing) {
            throw new ConflictException({
              code: "LOCATION_CODE_CONFLICT",
              message: "Location code already exists in this warehouse.",
            });
          }

          const location = await tx.warehouseLocation.create({
            data: {
              warehouseId,
              code: command.code,
              name: command.name ?? null,
              zone: command.zone ?? null,
              aisle: command.aisle ?? null,
              rack: command.rack ?? null,
              shelf: command.shelf ?? null,
              bin: command.bin ?? null,
            },
          });

          await this.auditLog.record(
            {
              action: "inventory.location.created",
              entityType: "warehouse-location",
              entityId: location.id,
              after: { code: location.code, warehouseId },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return this.toLocationDto(location);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async updateLocation(
    id: string,
    command: LocationUpdateCommand,
  ): Promise<LocationDto> {
    this.assertTracked(command);
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const location = await tx.warehouseLocation.findUnique({
            where: { id },
          });
          if (!location) {
            throw new NotFoundException({
              code: "LOCATION_NOT_FOUND",
              message: "Location not found.",
            });
          }

          const updated = await tx.warehouseLocation.update({
            where: { id },
            data: {
              ...(command.name !== undefined ? { name: command.name } : {}),
              ...(command.zone !== undefined ? { zone: command.zone } : {}),
              ...(command.aisle !== undefined ? { aisle: command.aisle } : {}),
              ...(command.rack !== undefined ? { rack: command.rack } : {}),
              ...(command.shelf !== undefined ? { shelf: command.shelf } : {}),
              ...(command.bin !== undefined ? { bin: command.bin } : {}),
              ...(command.isActive !== undefined
                ? { isActive: command.isActive }
                : {}),
            },
          });

          await this.auditLog.record(
            {
              action: "inventory.location.updated",
              entityType: "warehouse-location",
              entityId: location.id,
              before: { name: location.name, isActive: location.isActive },
              after: { name: updated.name, isActive: updated.isActive },
              actorId: command.actorId,
              requestId: command.requestId,
            },
            tx,
          );

          return this.toLocationDto(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  async getReservations(query: ReservationQuery) {
    const limit = clampInt(query.limit, 1, 100, 50);
    const offset = clampInt(query.offset, 0, MAX_OFFSET, 0);

    const where: Prisma.StockReservationWhereInput = {
      ...(query.warehouseId ? { warehouseId: query.warehouseId } : {}),
      ...(query.variantId ? { variantId: query.variantId } : {}),
      ...(query.status
        ? { status: query.status as Prisma.EnumReservationStatusFilter }
        : {}),
    };

    const [rows, count] = await Promise.all([
      this.prisma.stockReservation.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        skip: offset,
      }),
      this.prisma.stockReservation.count({ where }),
    ]);

    return { items: rows.map((row) => this.toReservationDto(row)), count };
  }

  private assertTracked(context: {
    actorId?: string | null;
    requestId?: string | null;
  }): void {
    if (!context.actorId?.trim() || !context.requestId?.trim()) {
      throw new BadRequestException(
        "actorId and requestId are required for inventory mutations.",
      );
    }
  }

  private async requireActiveReservation(reservationId: string) {
    const reservation = await this.prisma.stockReservation.findUnique({
      where: { id: reservationId },
    });
    if (!reservation) {
      throw new NotFoundException({
        code: "RESERVATION_NOT_FOUND",
        message: "Reservation not found.",
      });
    }
    if (reservation.status === "EXPIRED") {
      throw new ConflictException({
        code: "RESERVATION_EXPIRED",
        message: "Reservation has expired.",
      });
    }

    const balance = await this.prisma.inventoryBalance.findUnique({
      where: this.balanceKey({
        warehouseId: reservation.warehouseId,
        locationId: reservation.locationId,
        variantId: reservation.variantId,
      }),
    });
    if (!balance)
      throw new ConflictException({
        code: "RESERVATION_STATE_CONFLICT",
        message: "Reservation balance is missing.",
      });

    return { ...reservation, balanceId: balance.id };
  }

  private async expireSingleReservation(
    tx: Prisma.TransactionClient,
    reservationId: string,
    context: ActorContext,
  ): Promise<number> {
    const reservation = await tx.stockReservation.findUnique({
      where: { id: reservationId },
    });
    if (reservation?.status !== "ACTIVE") return 0;
    return this.rebalanceReservationRelease(
      tx,
      reservation,
      "EXPIRED",
      "inventory.reservation.expired",
      context,
    );
  }

  private async releaseSingleReservation(
    tx: Prisma.TransactionClient,
    reservation: StockReservationRow,
    context: ActorContext,
  ): Promise<number> {
    return this.rebalanceReservationRelease(
      tx,
      reservation,
      "RELEASED",
      "inventory.reservation.released",
      context,
    );
  }

  private async rebalanceReservationRelease(
    tx: Prisma.TransactionClient,
    reservation: {
      id: string;
      warehouseId: string;
      locationId: string;
      variantId: string;
    },
    toStatus: "EXPIRED" | "RELEASED",
    action: string,
    context: ActorContext,
  ): Promise<number> {
    await this.acquireBalanceLock(tx, reservation);
    const current = await tx.stockReservation.findUnique({
      where: { id: reservation.id },
    });
    if (current?.status !== "ACTIVE") return 0;

    const quantity = current.quantity;
    const balance = await tx.inventoryBalance.findUnique({
      where: this.balanceKey({
        warehouseId: current.warehouseId,
        locationId: current.locationId,
        variantId: current.variantId,
      }),
    });
    if (!balance || balance.reserved < quantity) {
      throw new ConflictException({
        code: "RESERVATION_STATE_CONFLICT",
        message: "Reservation balance is inconsistent.",
      });
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
      where: { id: current.id },
      data: { status: toStatus },
    });
    await this.auditLog.record(
      {
        action,
        entityType: "stock-reservation",
        entityId: current.id,
        before: { reserved: balance.reserved, available: balance.available },
        after: {
          reserved: balance.reserved - quantity,
          available: balance.available + quantity,
        },
        actorId: context.actorId,
        requestId: context.requestId,
      },
      tx,
    );
    return 1;
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

  private async acquireBalanceLock(
    tx: Prisma.TransactionClient,
    key: StockKey,
  ): Promise<void> {
    const [lockHi, lockLo] = advisoryLockIdKey(
      "balance",
      key.warehouseId,
      key.locationId,
      key.variantId,
    );
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHi}::int, ${lockLo}::int)`;
  }

  private reservationReplay<
    R extends { id: string; status: string },
    T extends { id: string },
  >(recheck: R | null, reservation: T): R | T | null {
    if (!recheck) return reservation;
    if (recheck.status === "EXPIRED") {
      throw new ConflictException({
        code: "RESERVATION_EXPIRED",
        message: "Reservation has expired.",
      });
    }
    return recheck.status === "ACTIVE" ? null : recheck;
  }

  private async assertStockIdentity(
    tx: Prisma.TransactionClient,
    key: StockKey,
  ) {
    const warehouse = await tx.warehouse.findUnique({
      where: { id: key.warehouseId },
      select: { id: true },
    });
    if (!warehouse) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "Warehouse not found.",
      });
    }

    const location = await tx.warehouseLocation.findFirst({
      where: {
        id: key.locationId,
        warehouseId: key.warehouseId,
        isActive: true,
      },
      select: { id: true },
    });
    if (!location) {
      throw new NotFoundException({
        code: "LOCATION_NOT_FOUND",
        message: "Active warehouse location not found.",
      });
    }

    const variant = await tx.productVariant.findUnique({
      where: { id: key.variantId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException({
        code: "SKU_NOT_FOUND",
        message: "SKU not found.",
      });
    }
  }

  private assertVersion(expected: number | undefined, actual: number): void {
    if (expected !== undefined && actual !== expected) {
      throw new ConflictException({
        code: "INVENTORY_VERSION_CONFLICT",
        message: "Inventory balance version conflict. Refresh and retry.",
      });
    }
  }

  private reservationMatches(
    reservation: {
      warehouseId: string;
      locationId: string;
      variantId: string;
      orderId: string | null;
      quantity: number;
      expiresAt: Date;
    },
    command: ReserveStockCommand,
  ): boolean {
    return (
      reservation.warehouseId === command.warehouseId &&
      reservation.locationId === command.locationId &&
      reservation.variantId === command.variantId &&
      (reservation.orderId ?? null) === (command.orderId ?? null) &&
      reservation.quantity === command.quantity &&
      reservation.expiresAt.getTime() === command.expiresAt.getTime()
    );
  }

  private movementMatches(
    movement: {
      warehouseId: string;
      locationId: string;
      variantId: string;
      type: string;
      quantity: number;
      reason: string | null;
      referenceType: string | null;
      referenceId: string | null;
    },
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

  private async transitionTransfer(
    action: "request" | "approve" | "dispatch" | "receive" | "cancel",
    id: string,
    context: TransferContext,
    allowedFrom: readonly string[],
  ): Promise<TransferDto> {
    this.assertTracked(context);
    return this.withSerializableRetry(() =>
      this.prisma.$transaction(
        async (tx) => {
          const transfer = await tx.stockTransfer.findUnique({
            where: { id },
            include: { items: true },
          });
          if (!transfer) {
            throw new NotFoundException({
              code: "TRANSFER_NOT_FOUND",
              message: "Transfer not found.",
            });
          }
          if (context.idempotencyKey) {
            const replay = await tx.stockTransferTransition.findUnique({
              where: { idempotencyKey: context.idempotencyKey },
            });
            if (replay) {
              if (
                replay.transferId !== id ||
                replay.action !== action ||
                replay.expectedVersion !== (context.expectedVersion ?? null)
              ) {
                throw new ConflictException({
                  code: "IDEMPOTENCY_CONFLICT",
                  message:
                    "Idempotency key was already used for a different transfer transition.",
                });
              }
              return this.toTransferDto(transfer);
            }
          }
          if (!allowedFrom.includes(transfer.status)) {
            throw new ConflictException({
              code: "TRANSFER_STATE_CONFLICT",
              message: `Transfer cannot be ${action}ed from status '${transfer.status}'.`,
            });
          }
          if (
            context.expectedVersion !== undefined &&
            context.expectedVersion !== transfer.version
          ) {
            throw new ConflictException({
              code: "TRANSFER_VERSION_CONFLICT",
              message: "Transfer version conflict. Refresh and retry.",
            });
          }

          if (action === "dispatch") {
            const missingLocation = transfer.items.find(
              (item) => !item.sourceLocationId,
            );
            if (missingLocation) {
              throw new ConflictException({
                code: "TRANSFER_ITEM_LOCATION_REQUIRED",
                message: `Dispatch requires a source location for item '${missingLocation.variantId}'.`,
              });
            }
            await this.applyTransferMovements(
              tx,
              transfer,
              transfer.items,
              "out",
            );
          }

          if (action === "receive") {
            const missingLocation = transfer.items.find(
              (item) => !item.targetLocationId,
            );
            if (missingLocation) {
              throw new ConflictException({
                code: "TRANSFER_ITEM_LOCATION_REQUIRED",
                message: `Receive requires a target location for item '${missingLocation.variantId}'.`,
              });
            }
            await this.applyTransferMovements(
              tx,
              transfer,
              transfer.items,
              "in",
            );
          }

          const nextStatus = this.nextTransferStatus(action);
          const updated = await tx.stockTransfer.update({
            where: { id },
            data: { status: nextStatus, version: { increment: 1 } },
            include: { items: true },
          });
          if (context.idempotencyKey) {
            await tx.stockTransferTransition.create({
              data: {
                transferId: id,
                action,
                idempotencyKey: context.idempotencyKey,
                expectedVersion: context.expectedVersion ?? null,
              },
            });
          }

          const auditAction =
            action === "receive"
              ? "inventory.transfer.received"
              : action === "approve"
                ? "inventory.transfer.approved"
                : `inventory.transfer.${action}ed`;
          await this.auditLog.record(
            {
              action: auditAction,
              entityType: "stock-transfer",
              entityId: transfer.id,
              before: { status: transfer.status },
              after: { status: updated.status },
              metadata: { code: transfer.code },
              actorId: context.actorId,
              requestId: context.requestId,
            },
            tx,
          );

          return this.toTransferDto(updated);
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      ),
    );
  }

  private nextTransferStatus(
    action: "request" | "approve" | "dispatch" | "receive" | "cancel",
  ): "REQUESTED" | "APPROVED" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED" {
    switch (action) {
      case "request":
        return "REQUESTED";
      case "approve":
        return "APPROVED";
      case "dispatch":
        return "IN_TRANSIT";
      case "receive":
        return "RECEIVED";
      case "cancel":
        return "CANCELLED";
    }
  }

  private async applyTransferMovements(
    tx: Prisma.TransactionClient,
    transfer: {
      sourceWarehouseId: string;
      targetWarehouseId: string;
      code: string;
    },
    items: Array<{
      variantId: string;
      quantity: number;
      sourceLocationId: string | null;
      targetLocationId: string | null;
    }>,
    direction: "out" | "in",
  ): Promise<void> {
    const warehouseId =
      direction === "out"
        ? transfer.sourceWarehouseId
        : transfer.targetWarehouseId;
    const movementType =
      direction === "out"
        ? InventoryMovementType.TRANSFER_OUT
        : InventoryMovementType.TRANSFER_IN;
    const stockKeys = items.map((item) => {
      const locationId =
        direction === "out" ? item.sourceLocationId : item.targetLocationId;
      if (!locationId) {
        throw new ConflictException({
          code: "TRANSFER_ITEM_LOCATION_REQUIRED",
          message: `${direction === "out" ? "Source" : "Target"} location is required for transfer movements.`,
        });
      }
      return { warehouseId, locationId, variantId: item.variantId };
    });
    const locationIds = [
      ...new Set(stockKeys.map(({ locationId }) => locationId)),
    ];
    const locations = await tx.warehouseLocation.findMany({
      where: { id: { in: locationIds }, warehouseId, isActive: true },
      select: { id: true },
    });
    if (locations.length !== locationIds.length) {
      throw new NotFoundException({
        code: "LOCATION_NOT_FOUND",
        message: "One or more active warehouse locations were not found.",
      });
    }

    const uniqueKeys = [
      ...new Map(
        stockKeys.map((key) => [
          `${key.locationId}\u0000${key.variantId}`,
          key,
        ]),
      ).values(),
    ];
    const balances = await tx.inventoryBalance.findMany({
      where: {
        OR: uniqueKeys.map(({ locationId, variantId }) => ({
          warehouseId,
          locationId,
          variantId,
        })),
      },
    });
    const balancesByKey = new Map(
      balances.map((balance) => [
        `${balance.locationId}\u0000${balance.variantId}`,
        balance,
      ]),
    );
    const projected = new Map<
      string,
      StockKey & { onHand: number; reserved: number }
    >(
      uniqueKeys.map((key) => {
        const balance = balancesByKey.get(
          `${key.locationId}\u0000${key.variantId}`,
        );
        return [
          `${key.locationId}\u0000${key.variantId}`,
          {
            ...key,
            onHand: balance?.onHand ?? 0,
            reserved: balance?.reserved ?? 0,
          },
        ];
      }),
    );
    const movements = items.map((item, index) => {
      const key = stockKeys[index];
      const projectedKey = `${key.locationId}\u0000${key.variantId}`;
      const balance = projected.get(projectedKey);
      if (!balance) {
        throw new Error(
          `Projected inventory balance '${projectedKey}' was not initialized.`,
        );
      }
      const delta = direction === "out" ? -item.quantity : item.quantity;
      const beforeOnHand = balance.onHand;
      const afterOnHand = beforeOnHand + delta;
      const available = afterOnHand - balance.reserved;
      if (afterOnHand < 0 || available < 0) {
        throw new ConflictException({
          code: "INSUFFICIENT_STOCK",
          message: "Insufficient stock for this operation.",
        });
      }
      balance.onHand = afterOnHand;
      return {
        warehouseId,
        locationId: key.locationId,
        variantId: key.variantId,
        type: movementType,
        quantity: delta,
        beforeOnHand,
        afterOnHand,
        referenceType: "stock-transfer",
        referenceId: transfer.code,
        reason: direction === "out" ? "Transfer dispatch" : "Transfer receive",
      };
    });

    for (const balance of projected.values()) {
      const available = balance.onHand - balance.reserved;
      await tx.inventoryBalance.upsert({
        where: this.balanceKey(balance),
        create: {
          warehouseId,
          locationId: balance.locationId,
          variantId: balance.variantId,
          onHand: balance.onHand,
          reserved: balance.reserved,
          available,
          version: 1,
        },
        update: {
          onHand: balance.onHand,
          available,
          version: { increment: 1 },
        },
      });
    }

    await tx.inventoryMovement.createMany({ data: movements });
  }

  private async assertWarehousePair(
    tx: Prisma.TransactionClient,
    sourceWarehouseId: string,
    targetWarehouseId: string,
  ) {
    if (sourceWarehouseId === targetWarehouseId) {
      throw new BadRequestException(
        "Source and target warehouses must be different.",
      );
    }
    const [source, target] = await Promise.all([
      tx.warehouse.findUnique({
        where: { id: sourceWarehouseId },
        select: { id: true },
      }),
      tx.warehouse.findUnique({
        where: { id: targetWarehouseId },
        select: { id: true },
      }),
    ]);
    if (!source) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "Source warehouse not found.",
      });
    }
    if (!target) {
      throw new NotFoundException({
        code: "WAREHOUSE_NOT_FOUND",
        message: "Target warehouse not found.",
      });
    }
  }

  private async assertVariants(
    tx: Prisma.TransactionClient,
    variantIds: readonly string[],
  ) {
    const uniqueIds = [...new Set(variantIds)];
    const variants = await tx.productVariant.findMany({
      where: { id: { in: uniqueIds } },
      select: { id: true },
    });
    if (variants.length !== uniqueIds.length) {
      throw new NotFoundException({
        code: "SKU_NOT_FOUND",
        message: "One or more SKUs were not found.",
      });
    }
  }

  private transferMatches(
    transfer: StockTransferRowLike,
    command: CreateTransferCommand,
  ): boolean {
    if (
      transfer.sourceWarehouseId !== command.sourceWarehouseId ||
      transfer.targetWarehouseId !== command.targetWarehouseId ||
      transfer.code !== (command.code ?? transfer.code) ||
      transfer.items.length !== command.items.length
    ) {
      return false;
    }
    return transfer.items.every((item, index) => {
      const input = command.items[index];
      return (
        item.variantId === input.variantId &&
        item.quantity === input.quantity &&
        (item.sourceLocationId ?? null) === (input.sourceLocationId ?? null) &&
        (item.targetLocationId ?? null) === (input.targetLocationId ?? null)
      );
    });
  }

  private toTransferDto(transfer: TransferRowLike): TransferDto {
    return {
      id: transfer.id,
      code: transfer.code,
      sourceWarehouseId: transfer.sourceWarehouseId,
      targetWarehouseId: transfer.targetWarehouseId,
      status: transfer.status,
      version: transfer.version,
      items: transfer.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        sourceLocationId: item.sourceLocationId ?? null,
        targetLocationId: item.targetLocationId ?? null,
      })),
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }

  private toMovementDto(movement: {
    id: string;
    warehouseId: string;
    locationId: string;
    variantId: string;
    type: InventoryMovementType;
    quantity: number;
    beforeOnHand: number;
    afterOnHand: number;
    reason: string | null;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: Date;
  }): InventoryMovementDto {
    return {
      id: movement.id,
      warehouseId: movement.warehouseId,
      locationId: movement.locationId,
      variantId: movement.variantId,
      type: movement.type,
      quantity: movement.quantity,
      beforeOnHand: movement.beforeOnHand,
      afterOnHand: movement.afterOnHand,
      reason: movement.reason,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      createdAt: movement.createdAt.toISOString(),
    };
  }

  private toWarehouseDto(warehouse: {
    id: string;
    code: string;
    name: string;
    city: string | null;
    address: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): WarehouseDto {
    return {
      id: warehouse.id,
      code: warehouse.code,
      name: warehouse.name,
      city: warehouse.city,
      address: warehouse.address,
      isActive: warehouse.isActive,
      createdAt: warehouse.createdAt,
      updatedAt: warehouse.updatedAt,
    };
  }

  private toLocationDto(location: {
    id: string;
    warehouseId: string;
    code: string;
    name: string | null;
    zone: string | null;
    aisle: string | null;
    rack: string | null;
    shelf: string | null;
    bin: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LocationDto {
    return {
      id: location.id,
      warehouseId: location.warehouseId,
      code: location.code,
      name: location.name,
      zone: location.zone,
      aisle: location.aisle,
      rack: location.rack,
      shelf: location.shelf,
      bin: location.bin,
      isActive: location.isActive,
      createdAt: location.createdAt,
      updatedAt: location.updatedAt,
    };
  }

  private toReservationDto(reservation: {
    id: string;
    warehouseId: string;
    locationId: string;
    variantId: string;
    orderId: string | null;
    quantity: number;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: reservation.id,
      warehouseId: reservation.warehouseId,
      locationId: reservation.locationId,
      variantId: reservation.variantId,
      orderId: reservation.orderId,
      quantity: reservation.quantity,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }

  private async withSerializableRetry<T>(
    operation: () => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const isSerializationAbort =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: unknown }).code === "P2034";
        if (isSerializationAbort && attempt < SERIALIZABLE_RETRIES - 1) {
          await sleep(retryDelayMs(attempt + 1));
          continue;
        }
        if (isSerializationAbort) {
          throw new ConflictException(
            "Stock operation could not be applied because of concurrent updates. Refresh the current state and retry.",
          );
        }
        throw error;
      }
    }
    throw new ConflictException(
      "Stock operation could not be applied because of concurrent updates. Refresh the current state and retry.",
    );
  }
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value as number));
}
