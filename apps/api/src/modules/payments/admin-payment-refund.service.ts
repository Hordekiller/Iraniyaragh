import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { AdminRefundRequest, AdminRefundResponse } from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { recordTransition } from '../../common/state-machine';
import { withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { remainingRefundable } from './admin-payment-read.service';

const REFUND_SCOPE = 'payment.refund';
const MAX_REFERENCE_LENGTH = 128;
const MAX_REASON_LENGTH = 255;
const MAX_NOTE_LENGTH = 500;
function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Control characters, not whitespace: a reason may contain ordinary spaces. */
function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
}

function isBoundedText(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && !hasControlCharacter(value);
}

type RefundInput = AdminRefundRequest & {
  paymentId: string;
  actorId: string;
  requestId: string;
  idempotencyKey: string;
};

@Injectable()
export class AdminPaymentRefundService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditLogService) private readonly audit: AuditLogService,
  ) {}

  /**
   * Records a refund staff already performed in the gateway panel. The gateway is
   * never called: Zarinpal v4 has no refund API, so this command moves the money
   * state machine from evidence, not from a transfer.
   */
  async record(input: RefundInput): Promise<AdminRefundResponse> {
    const amount = this.parseAmount(input.amountMinorUnits);
    this.assertEvidence(input);

    const keyHash = hash(`${REFUND_SCOPE}:${input.paymentId}:${input.idempotencyKey}`);
    const fingerprint = hash(
      JSON.stringify({
        scope: REFUND_SCOPE,
        amount: amount.toString(),
        gatewayReferenceId: input.gatewayReferenceId,
        reason: input.reason,
        note: input.note ?? null,
      }),
    );

    return withSerializableRetry({
      isContention: () => false,
      conflictMessage: 'Payment changed concurrently; retry with the same idempotency key.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            // Replay first: a lost response must never record a second refund.
            const claimed = await tx.refund.findUnique({
              where: { idempotencyKey: keyHash },
              select: {
                id: true, paymentId: true, amount: true, status: true, gatewayReferenceId: true,
                reason: true, note: true, createdAt: true,
                payment: { select: { status: true, amount: true, refundedAmount: true, orderId: true } },
              },
            });
            if (claimed) {
              if (claimed.paymentId !== input.paymentId) {
                throw new ConflictException({
                  code: 'IDEMPOTENCY_CONFLICT',
                  message: 'Idempotency key belongs to another payment.',
                });
              }
              return this.replay(claimed, fingerprint);
            }
            // Every payment money transition in this codebase takes the order
            // lock first, so a refund cannot interleave with settlement,
            // reconciliation or order compensation. The order is read before the
            // lock and the payment is re-read inside it, so no decision is made
            // from a stale row.
            const owner = await tx.payment.findUnique({
              where: { id: input.paymentId },
              select: { orderId: true },
            });
            if (!owner) {
              throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found.' });
            }
            const [lockHi, lockLo] = advisoryLockIdKey('order', owner.orderId);
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHi}::int, ${lockLo}::int)`;

            const payment = await tx.payment.findUnique({
              where: { id: input.paymentId },
              select: {
                id: true, status: true, amount: true, refundedAmount: true, orderId: true,
              },
            });
            if (!payment) {
              throw new NotFoundException({ code: 'NOT_FOUND', message: 'Payment not found.' });
            }

            // Snapshot the before-state: the audit must describe what was true
            // when the decision was made, not what the writes left behind.
            const previousStatus = payment.status;
            const previousRefunded = payment.refundedAmount;
            const remaining = remainingRefundable(payment);
            if (remaining === 0n) {
              throw new ConflictException({
                code: 'PAYMENT_STATE_CONFLICT',
                message:
                  payment.status === 'REFUNDED'
                    ? 'This payment is already fully refunded.'
                    : 'Only a settled payment can be refunded.',
              });
            }
            if (amount > remaining) {
              throw new UnprocessableEntityException({
                code: 'REFUND_AMOUNT_EXCEEDS_REMAINING',
                message: 'Refund amount exceeds the remaining refundable amount.',
              });
            }

            const refundedTotal = payment.refundedAmount + amount;
            const fullyRefunded = refundedTotal === payment.amount;
            const nextStatus = fullyRefunded ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
            // A further partial refund leaves the status where it already is. The
            // shared state machine rejects a self-transition on purpose, so the
            // unchanged status must not be rewritten; the refund row, the audit
            // row and the outbox event still record this money movement.
            const statusChanges = nextStatus !== payment.status;

            const refund = await tx.refund.create({
              data: {
                paymentId: payment.id,
                amount,
                status: 'RECORDED',
                gatewayReferenceId: input.gatewayReferenceId,
                reason: input.reason,
                note: input.note ?? null,
                idempotencyKey: keyHash,
                idempotencyFingerprint: fingerprint,
                actorId: input.actorId,
                requestId: input.requestId,
              },
              select: { id: true, createdAt: true },
            });

            // `recordTransition` owns the status change and its compare-and-set,
            // so this write must not claim the status itself.
            await tx.payment.update({
              where: { id: payment.id },
              data: { refundedAmount: refundedTotal },
            });
            if (statusChanges) {
              await recordTransition(tx, 'payment', payment.id, payment.status, nextStatus, {
                requestId: input.requestId,
                reason: 'REFUND_RECORDED',
                actorId: input.actorId,
              });
            }

            // Audit travels inside the transaction: a refund can never exist
            // without the staff action that authorized it.
            await this.audit.record(
              {
                action: 'payment.refund.recorded',
                entityType: 'payment',
                entityId: payment.id,
                actorId: input.actorId,
                requestId: input.requestId,
                before: {
                  status: previousStatus,
                  refundedTotal: previousRefunded.toString(),
                },
                after: {
                  status: nextStatus,
                  refundedTotal: refundedTotal.toString(),
                  refundId: refund.id,
                },
              },
              tx,
            );

            await tx.outboxEvent.create({
              data: {
                topic: 'PAYMENT_REFUNDED',
                aggregateType: 'payment',
                aggregateId: payment.id,
                deduplicationKey: `payment-refunded:${refund.id}`,
                payload: {
                  refundId: refund.id,
                  paymentId: payment.id,
                  orderId: payment.orderId,
                  amount: amount.toString(),
                  currency: 'IRR',
                  refundedTotal: refundedTotal.toString(),
                  paymentStatus: nextStatus,
                  gatewayReferenceId: input.gatewayReferenceId,
                },
              },
            });

            return {
              data: {
                refund: {
                  refundId: refund.id,
                  paymentId: payment.id,
                  orderId: payment.orderId,
                  amount: { amount: amount.toString(), currency: 'IRR' },
                  status: 'RECORDED',
                  gatewayReferenceId: input.gatewayReferenceId,
                  reason: input.reason,
                  note: input.note ?? null,
                  paymentStatus: nextStatus,
                  refundedTotal: { amount: refundedTotal.toString(), currency: 'IRR' },
                  remainingRefundable: {
                    amount: (payment.amount - refundedTotal).toString(),
                    currency: 'IRR',
                  },
                  createdAt: refund.createdAt.toISOString(),
                },
              },
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  /** A retry under the same key must be the same refund, never a second one. */
  private replay(
    claimed: {
      id: string;
      paymentId: string;
      amount: bigint;
      status: string;
      gatewayReferenceId: string;
      reason: string;
      note: string | null;
      createdAt: Date;
      payment: { status: string; amount: bigint; refundedAmount: bigint; orderId: string };
    },
    fingerprint: string,
  ): AdminRefundResponse {
    const stored = hash(
      JSON.stringify({
        scope: REFUND_SCOPE,
        amount: claimed.amount.toString(),
        gatewayReferenceId: claimed.gatewayReferenceId,
        reason: claimed.reason,
        note: claimed.note,
      }),
    );
    if (stored !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key payload conflict.',
      });
    }
    return {
      data: {
        refund: {
          refundId: claimed.id,
          paymentId: claimed.paymentId,
          orderId: claimed.payment.orderId,
          amount: { amount: claimed.amount.toString(), currency: 'IRR' },
          status: 'RECORDED',
          gatewayReferenceId: claimed.gatewayReferenceId,
          reason: claimed.reason,
          note: claimed.note,
          paymentStatus:
            claimed.payment.status === 'REFUNDED' ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          refundedTotal: { amount: claimed.payment.refundedAmount.toString(), currency: 'IRR' },
          remainingRefundable: {
            amount: (claimed.payment.amount - claimed.payment.refundedAmount).toString(),
            currency: 'IRR',
          },
          createdAt: claimed.createdAt.toISOString(),
        },
      },
    };
  }

  private parseAmount(raw: string): bigint {
    if (!/^[0-9]+$/u.test(raw)) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST',
        message: 'Refund amount must be a positive integer amount in Rial.',
      });
    }
    const amount = BigInt(raw);
    if (amount <= 0n) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST',
        message: 'Refund amount must be greater than zero.',
      });
    }
    return amount;
  }

  /** Without the panel's own reference a refund is a claim, not evidence. */
  private assertEvidence(input: AdminRefundRequest): void {
    if (
      !isBoundedText(input.gatewayReferenceId.trim(), MAX_REFERENCE_LENGTH) ||
      input.gatewayReferenceId !== input.gatewayReferenceId.trim() ||
      !isBoundedText(input.reason.trim(), MAX_REASON_LENGTH) ||
      input.reason !== input.reason.trim() ||
      (input.note !== undefined &&
        (input.note.length > MAX_NOTE_LENGTH || hasControlCharacter(input.note)))
    ) {
      throw new UnprocessableEntityException({
        code: 'INVALID_REQUEST',
        message: 'A refund requires a gateway reference and a reason.',
      });
    }
  }
}
