import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  OrderCancelResponse,
  OrderCommandResult,
  OrderExpiryRunResponse,
} from "@iranyaragh/contracts";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import {
  ORDER_STATE_CONFLICT_ERROR,
  recordTransition,
} from "../../common/state-machine";
import { withSerializableRetry } from "../../common/serializable-retry";
import { AuditLogService } from "../audit/audit-log.service";
import { InventoryService } from "../inventory/inventory.service";
import type { AuditEventInput } from "../audit/audit-log.service";

const CUSTOMER_CANCEL_SCOPE = "order.cancel:customer";
const STAFF_CANCEL_SCOPE = "order.cancel:staff";

const ORDER_CANCEL_RECORD_TTL_MS = 24 * 60 * 60 * 1000;
const EXPIRY_BATCH_SIZE = 100;

const RELEASE_REASON = {
  customer: "CUSTOMER_CANCELLED",
  staff: "STAFF_CANCELLED",
  expiry: "RESERVATION_EXPIRED",
} as const;

type OrderCommandContext = {
  actorId: string;
  requestId: string;
};

type CancelCommand = {
  orderId: string;
  scope: string;
  ownerCustomerId?: string;
  actorId: string;
  requestId: string;
  idempotencyKey: string;
  fingerprint: string;
  reason: string;
};

@Injectable()
export class OrderCommandService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly auditLog: AuditLogService,
    private readonly inventory: InventoryService,
  ) {}

  async cancelAsCustomer(
    userId: string,
    orderId: string,
    input: { idempotencyKey: string; requestId: string },
  ): Promise<OrderCancelResponse> {
    this.assertTracked({ actorId: userId, requestId: input.requestId });
    const customer = await this.prisma.customer.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!customer) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "Customer profile is not linked to the authenticated user.",
      });
    }

    const result = await this.cancel({
      orderId,
      scope: CUSTOMER_CANCEL_SCOPE,
      ownerCustomerId: customer.id,
      actorId: userId,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: hash(
        JSON.stringify({
          actorId: userId,
          reason: RELEASE_REASON.customer,
        }),
      ),
      reason: RELEASE_REASON.customer,
    });
    return { data: { order: result } };
  }

  async cancelAsStaff(
    userId: string,
    orderId: string,
    input: { idempotencyKey: string; requestId: string },
  ): Promise<OrderCancelResponse> {
    this.assertTracked({ actorId: userId, requestId: input.requestId });
    const result = await this.cancel({
      orderId,
      scope: STAFF_CANCEL_SCOPE,
      actorId: userId,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      fingerprint: hash(
        JSON.stringify({
          actorId: userId,
          reason: RELEASE_REASON.staff,
        }),
      ),
      reason: RELEASE_REASON.staff,
    });
    return { data: { order: result } };
  }

  async expirePendingPaymentOrders(
    context: OrderCommandContext,
    options: { now?: Date; batchSize?: number } = {},
  ): Promise<OrderExpiryRunResponse> {
    this.assertTracked(context);
    const now = options.now ?? new Date();
    const batchSize = clampInt(
      options.batchSize,
      1,
      EXPIRY_BATCH_SIZE,
      EXPIRY_BATCH_SIZE,
    );

    const candidates = await this.prisma.order.findMany({
      where: {
        status: "PENDING_PAYMENT",
        reservationExpiresAt: { lte: now },
      },
      orderBy: [{ reservationExpiresAt: "asc" }, { id: "asc" }],
      select: { id: true },
      take: batchSize,
    });

    let expired = 0;
    for (const candidate of candidates) {
      try {
        const released = await this.expireOrder(candidate.id, context, now);
        if (released > 0) expired += 1;
      } catch (error) {
        // A concurrent cancel or another expiry already moved the order out of
        // PENDING_PAYMENT. The worker writes no claim, so the race is benign;
        // a second run simply re-selects the survivors.
        if (isOrderStateConflict(error)) continue;
        throw error;
      }
    }
    return { data: { expired } };
  }

  private async cancel(command: CancelCommand): Promise<OrderCommandResult> {
    return withSerializableRetry({
      isContention: (error) => error instanceof OrderCommandContentionError,
      conflictMessage:
        "Order changed concurrently; retry with the same idempotency key.",
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const now = new Date();
            await this.acquireOrderLock(tx, command.orderId);

            const keyHash = hash(command.idempotencyKey);
            await tx.orderCommandIdempotencyRecord.deleteMany({
              where: {
                orderId: command.orderId,
                scope: command.scope,
                keyHash,
                expiresAt: { lte: now },
              },
            });

            const prior = await tx.orderCommandIdempotencyRecord.findUnique({
              where: {
                orderId_scope_keyHash: {
                  orderId: command.orderId,
                  scope: command.scope,
                  keyHash,
                },
              },
            });
            if (prior) {
              if (prior.fingerprint !== command.fingerprint) {
                throw new ConflictException({
                  code: "IDEMPOTENCY_CONFLICT",
                  message: "Idempotency key payload conflict.",
                });
              }
              if (prior.responseJson) {
                return prior.responseJson as unknown as OrderCommandResult;
              }
              throw new OrderCommandContentionError(
                `Order command for ${command.orderId} is still running.`,
              );
            }

            const claim = await tx.orderCommandIdempotencyRecord.create({
              data: {
                orderId: command.orderId,
                scope: command.scope,
                keyHash,
                fingerprint: command.fingerprint,
                expiresAt: new Date(now.getTime() + ORDER_CANCEL_RECORD_TTL_MS),
              },
            });

            const order = await tx.order.findUnique({
              where: { id: command.orderId },
              select: {
                id: true,
                number: true,
                customerId: true,
                status: true,
              },
            });
            if (!order) {
              throw new NotFoundException({
                code: "ORDER_NOT_FOUND",
                message: "Order not found.",
              });
            }
            if (
              command.ownerCustomerId &&
              order.customerId !== command.ownerCustomerId
            ) {
              // A foreign customer must not learn that this order exists.
              throw new NotFoundException({
                code: "ORDER_NOT_FOUND",
                message: "Order not found.",
              });
            }
            if (order.status !== "PENDING_PAYMENT") {
              throw new ConflictException({
                code: ORDER_STATE_CONFLICT_ERROR,
                message: "Order is no longer pending payment.",
              });
            }

            const transition = await recordTransition(
              tx,
              "order",
              order.id,
              "PENDING_PAYMENT",
              "CANCELLED",
              {
                actorId: command.actorId,
                requestId: command.requestId,
                reason: command.reason,
              },
            );

            const releasedReservations =
              await this.inventory.releaseReservationsForOrder(tx, order.id, {
                actorId: command.actorId,
                requestId: command.requestId,
              });

            const cancelledAt = now.toISOString();
            const result: OrderCommandResult = {
              id: order.id,
              number: order.number,
              status: "CANCELLED",
              releasedReservations,
              cancelledAt,
            };

            await tx.outboxEvent.create({
              data: {
                topic: "ORDER_CANCELLED",
                aggregateType: "order",
                aggregateId: order.id,
                deduplicationKey: `order-cancelled:${order.id}`,
                payload: {
                  orderId: order.id,
                  customerId: order.customerId,
                  reason: command.reason,
                  releasedReservations,
                  cancelledAt,
                },
              },
            });

            await this.auditLog.record(
              {
                action: "order.cancelled",
                entityType: "order",
                entityId: order.id,
                before: { status: "PENDING_PAYMENT" },
                after: { status: "CANCELLED", releasedReservations },
                metadata: {
                  reason: command.reason,
                  transitionId: transition.id,
                },
                actorId: command.actorId,
                requestId: command.requestId,
              } satisfies AuditEventInput,
              tx,
            );

            await tx.orderCommandIdempotencyRecord.update({
              where: { id: claim.id },
              data: {
                responseJson: result as unknown as Prisma.InputJsonValue,
              },
            });

            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private async expireOrder(
    orderId: string,
    context: OrderCommandContext,
    now: Date,
  ): Promise<number> {
    return withSerializableRetry({
      isContention: (error) => error instanceof OrderCommandContentionError,
      conflictMessage:
        "Order changed concurrently; retry with the same idempotency key.",
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            await this.acquireOrderLock(tx, orderId);

            const order = await tx.order.findUnique({
              where: { id: orderId },
              select: {
                id: true,
                number: true,
                customerId: true,
                status: true,
              },
            });
            if (order?.status !== "PENDING_PAYMENT") return 0;

            const requestId = requestIdForOrder(context.requestId, order.id);
            const transition = await recordTransition(
              tx,
              "order",
              order.id,
              "PENDING_PAYMENT",
              "CANCELLED",
              {
                actorId: context.actorId,
                requestId,
                reason: RELEASE_REASON.expiry,
              },
            );

            const releasedReservations =
              await this.inventory.releaseReservationsForOrder(
                tx,
                order.id,
                context,
              );

            const expiredAt = now.toISOString();
            await tx.outboxEvent.create({
              data: {
                topic: "ORDER_EXPIRED",
                aggregateType: "order",
                aggregateId: order.id,
                deduplicationKey: `order-expired:${order.id}`,
                payload: {
                  orderId: order.id,
                  customerId: order.customerId,
                  reason: RELEASE_REASON.expiry,
                  releasedReservations,
                  expiredAt,
                },
              },
            });

            await this.auditLog.record(
              {
                action: "order.expired",
                entityType: "order",
                entityId: order.id,
                before: { status: "PENDING_PAYMENT" },
                after: { status: "CANCELLED", releasedReservations },
                metadata: {
                  reason: RELEASE_REASON.expiry,
                  transitionId: transition.id,
                },
                actorId: context.actorId,
                requestId,
              } satisfies AuditEventInput,
              tx,
            );

            return releasedReservations;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private async acquireOrderLock(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const [lockHi, lockLo] = advisoryLockIdKey("order", orderId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHi}::int, ${lockLo}::int)`;
  }

  private assertTracked(context: OrderCommandContext): void {
    if (!context.actorId || !context.requestId) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "A tracked actor and request context are required.",
      });
    }
  }
}

class OrderCommandContentionError extends Error {
  readonly code = "ORDER_COMMAND_CONTENTION";
}

function isOrderStateConflict(error: unknown): boolean {
  return (
    error instanceof ConflictException &&
    (error as unknown as { response?: { code?: string } }).response?.code ===
      ORDER_STATE_CONFLICT_ERROR
  );
}

function requestIdForOrder(baseRequestId: string, orderId: string): string {
  return `${baseRequestId}:${orderId}`.slice(0, 128);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clampInt(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || !Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
