import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { FulfillmentStatus, Prisma } from "@prisma/client";
import { advisoryLockIdKey } from "../../common/advisory-lock";
import { recordTransition } from "../../common/state-machine";
import { withSerializableRetry } from "../../common/serializable-retry";
import { PrismaService } from "../../database/prisma.service";
import { AuditLogService } from "../audit/audit-log.service";

type Command = "start" | "ready";
type Result = {
  data: {
    fulfillment: {
      id: string;
      orderId: string;
      status: "PROCESSING" | "READY_TO_SHIP";
      updatedAt: string;
    };
  };
};

const transitions = {
  start: { from: FulfillmentStatus.PENDING, to: FulfillmentStatus.PROCESSING },
  ready: {
    from: FulfillmentStatus.PROCESSING,
    to: FulfillmentStatus.READY_TO_SHIP,
  },
} as const;

@Injectable()
export class FulfillmentCommandService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  async execute(
    orderId: string,
    command: Command,
    context: { actorId: string; requestId: string; idempotencyKey: string },
  ): Promise<Result> {
    if (!context.actorId || !context.requestId) {
      throw new ConflictException({
        code: "CONFLICT",
        message: "A tracked actor and request are required.",
      });
    }
    const transition = transitions[command];
    const keyHash = sha256(context.idempotencyKey);
    const fingerprint = sha256(
      JSON.stringify({ actorId: context.actorId, command }),
    );
    return withSerializableRetry({
      isContention: () => false,
      conflictMessage:
        "Fulfillment changed concurrently; retry with the same idempotency key.",
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const [hi, lo] = advisoryLockIdKey("order", orderId);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${hi}::int, ${lo}::int)`;
            const order = await tx.order.findUnique({
              where: { id: orderId },
              select: {
                id: true,
                status: true,
                fulfillment: { select: { id: true, status: true } },
                payments: {
                  where: { status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
                  select: { id: true },
                  take: 1,
                },
              },
            });
            if (!order) {
              throw new NotFoundException({
                code: "ORDER_NOT_FOUND",
                message: "Order not found.",
              });
            }
            const scope = `fulfillment.${command}:staff`;
            const prior = await tx.orderCommandIdempotencyRecord.findUnique({
              where: { orderId_scope_keyHash: { orderId, scope, keyHash } },
            });
            if (prior) {
              if (prior.fingerprint !== fingerprint) {
                throw new ConflictException({
                  code: "IDEMPOTENCY_CONFLICT",
                  message: "Idempotency key payload conflict.",
                });
              }
              if (prior.responseJson)
                return prior.responseJson as unknown as Result;
              throw new ConflictException({
                code: "CONFLICT",
                message: "Fulfillment command is still running.",
              });
            }
            if (
              order.status !== "PAID" ||
              order.fulfillment?.status !== transition.from ||
              order.payments.length === 0
            ) {
              throw new ConflictException({
                code: "FULFILLMENT_STATE_CONFLICT",
                message: "Fulfillment is not in the required paid-order state.",
              });
            }
            // Settlement must have consumed every order reservation before any operator work begins.
            if (command === "start") {
              const [total, consumed] = await Promise.all([
                tx.stockReservation.count({ where: { orderId } }),
                tx.stockReservation.count({
                  where: { orderId, status: "CONSUMED" },
                }),
              ]);
              if (total === 0 || consumed !== total) {
                throw new ConflictException({
                  code: "FULFILLMENT_STATE_CONFLICT",
                  message: "Paid order inventory has not been consumed.",
                });
              }
            }
            const state = await recordTransition(
              tx,
              "fulfillment",
              order.fulfillment.id,
              transition.from,
              transition.to,
              {
                actorId: context.actorId,
                requestId: context.requestId,
                reason: `STAFF_${command.toUpperCase()}`,
              },
            );
            const updated = await tx.fulfillment.findUniqueOrThrow({
              where: { id: order.fulfillment.id },
              select: { id: true, updatedAt: true },
            });
            const result: Result = {
              data: {
                fulfillment: {
                  id: updated.id,
                  orderId,
                  status: transition.to,
                  updatedAt: updated.updatedAt.toISOString(),
                },
              },
            };
            await this.audit.record(
              {
                action: `fulfillment.${command}`,
                entityType: "fulfillment",
                entityId: updated.id,
                before: { status: transition.from },
                after: { status: transition.to },
                metadata: { orderId, transitionId: state.id },
                actorId: context.actorId,
                requestId: context.requestId,
              },
              tx,
            );
            await tx.orderCommandIdempotencyRecord.create({
              data: {
                orderId,
                scope,
                keyHash,
                fingerprint,
                responseJson: result as unknown as Prisma.InputJsonValue,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              },
            });
            return result;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
