import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { PaymentVerificationResponse } from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { ORDER_STATE_CONFLICT_ERROR, recordTransition } from '../../common/state-machine';
import { isPrismaSerializableContention, withSerializableRetry } from '../../common/serializable-retry';
import { AuditLogService } from '../audit/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  PAYMENT_GATEWAY_CONFIG,
  PAYMENT_PROVIDER,
  type PaymentGatewayConfig,
  type PaymentProvider,
} from './payment-provider.port';

const REASON_VERIFIED = 'GATEWAY_VERIFIED';
const REASON_ORDER_PAID = 'PAYMENT_VERIFIED';
const REASON_NOT_PAID = 'gateway_not_paid';
const REASON_UNCONFIRMED = 'gateway_verify_unconfirmed';

const MAX_AUTHORITY_LENGTH = 128;

type VerifyInput = Readonly<{
  authority: string;
  status: string | undefined;
  requestId: string;
}>;

type PaymentWithOrder = {
  id: string;
  orderId: string;
  provider: string;
  amount: bigint;
  status: string;
  authority: string | null;
  referenceId: string | null;
  gatewayEnvironment: string;
  order: {
    id: string;
    status: string;
    grandTotal: bigint;
  };
};

type VerificationOutcome = {
  paymentId: string;
  paymentStatus: 'PAID' | 'PENDING' | 'FAILED';
  amount: bigint;
  authority: string;
  referenceId: string | null;
  outcome: 'VERIFIED' | 'REPLAY' | 'VERIFIED_AFTER_CANCELLED' | 'NOT_PAID' | 'ACCEPTED_UNCONFIRMED';
  orderId: string;
  orderStatus: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';
  consumedReservations: number;
  fulfillmentId: string | null;
};

@Injectable()
export class PaymentVerificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENT_GATEWAY_CONFIG) private readonly gateway: PaymentGatewayConfig,
    private readonly auditLog: AuditLogService,
    private readonly inventory: InventoryService,
  ) {}

  /**
   * Verifies a gateway callback. The callback parameters alone are never proof:
   * the provider is asked server-side whether the transaction actually settled
   * BEFORE any state machine advances. Side effects (payment, order, stock,
   * fulfillment, outbox) are applied inside one short SERIALIZABLE transaction
   * guarded by the per-order advisory lock, which serializes against concurrent
   * cancellation, expiry and duplicate verifications.
   */
  async verify(input: VerifyInput): Promise<PaymentVerificationResponse> {
    const authority = input.authority.trim();
    if (authority.length === 0 || authority.length > MAX_AUTHORITY_LENGTH) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'A valid gateway authority is required.',
      });
    }
    if (input.status !== undefined && input.status !== 'OK' && input.status !== 'NOK') {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Callback Status must be OK or NOK.',
      });
    }

    const payment = await this.prisma.payment.findFirst({
      where: { authority },
      include: { order: { select: { id: true, status: true, grandTotal: true } } },
    });
    if (!payment) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Payment not found.',
      });
    }
    this.assertPaymentBelongsToGateway(payment);

    if (payment.status !== 'PENDING') {
      // Already settled (PAID -> idempotent replay) or terminal (FAILED/CANCELLED
      // -> stale callback replayed as-is, never resurrected).
      return { data: { verification: this.asResponse(this.replayOutcome(payment)) } };
    }

    if (input.status === 'NOK') {
      const outcome = await this.markNotPaid(payment, input.requestId);
      return { data: { verification: this.asResponse(outcome) } };
    }

    // Provider call strictly outside any database transaction.
    const verifyResult = await this.provider.verify({
      amountMinorUnits: payment.amount.toString(),
      currency: 'IRR',
      authority,
      correlationId: input.requestId,
    });

    if (verifyResult.status === 'verified') {
      const outcome = await this.applyVerified(payment, verifyResult.referenceId, input.requestId);
      return { data: { verification: this.asResponse(outcome) } };
    }
    if (verifyResult.status === 'failed') {
      const outcome = await this.markNotPaid(payment, input.requestId);
      return { data: { verification: this.asResponse(outcome) } };
    }
    if (verifyResult.status === 'unavailable') {
      // Nothing is persisted; the gateway may retry the callback and the payment
      // stays PENDING.
      throw new ServiceUnavailableException({
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Payment gateway is unavailable while verifying the callback.',
      });
    }

    // Ambiguous verify (timeout/abort): the gateway may already have settled the
    // money, so it must NOT become a definitive FAILED. The payment stays PENDING
    // and a reconciliation record is emitted instead.
    const outcome = await this.recordUnconfirmed(payment, input.requestId);
    return { data: { verification: this.asResponse(outcome) } };
  }

  private assertPaymentBelongsToGateway(payment: PaymentWithOrder): void {
    if (
      payment.provider !== this.gateway.providerName ||
      payment.gatewayEnvironment !== this.gateway.mode
    ) {
      throw new BadRequestException({
        code: 'INVALID_REQUEST',
        message: 'Payment does not belong to the active gateway.',
      });
    }
  }

  private replayOutcome(payment: PaymentWithOrder): VerificationOutcome {
    const status = payment.status === 'PAID' ? 'PAID' : payment.status === 'PENDING' ? 'PENDING' : 'FAILED';
    const orderStatus = this.orderStatusOf(payment.order.status);
    return {
      paymentId: payment.id,
      paymentStatus: status,
      amount: payment.amount,
      authority: payment.authority ?? '',
      referenceId: payment.referenceId,
      outcome: 'REPLAY',
      orderId: payment.orderId,
      orderStatus,
      consumedReservations: 0,
      fulfillmentId: null,
    };
  }

  private async applyVerified(
    payment: PaymentWithOrder,
    referenceId: string,
    requestId: string,
  ): Promise<VerificationOutcome> {
    return withSerializableRetry({
      isContention: (error) => error instanceof VerificationContentionError || isPrismaSerializableContention(error),
      conflictMessage: 'Payment changed concurrently; the settlement was not recorded.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const orderId = payment.orderId;
            await this.acquireOrderLock(tx, orderId);

            const settled = await tx.payment.findUnique({
              where: { id: payment.id },
              include: { order: { select: { id: true, status: true, grandTotal: true } } },
            });
            if (!settled) {
              throw new NotFoundException({
                code: 'NOT_FOUND',
                message: 'Payment not found.',
              });
            }
            if (settled.status === 'PAID') {
              return this.replayOutcome(settled as PaymentWithOrder);
            }
            if (settled.status !== 'PENDING') {
              throw new ConflictException({
                code: 'PAYMENT_STATE_CONFLICT',
                message: 'Payment already has a terminal outcome.',
              });
            }
            if (settled.amount !== settled.order.grandTotal) {
              throw new ConflictException({
                code: 'PAYMENT_STATE_CONFLICT',
                message: 'Payment amount no longer matches the order total.',
              });
            }

            if (settled.order.status === 'CANCELLED') {
              // Money was actually received for an order that a concurrent
              // cancellation/expiry already closed. The financial truth is recorded
              // (PAID) but nothing is consumed and no fulfillment is created; a
              // reconciliation event tells operations about it.
              return this.settleAfterCancellation(tx, settled as PaymentWithOrder, referenceId, requestId);
            }

            await recordTransition(tx, 'payment', payment.id, 'PENDING', 'PAID', {
              requestId,
              reason: REASON_VERIFIED,
            });
            await tx.payment.update({
              where: { id: payment.id },
              data: { referenceId },
            });

            let orderTransitionId: string | null = null;
            if (settled.order.status === 'PENDING_PAYMENT') {
              const transition = await recordTransition(tx, 'order', orderId, 'PENDING_PAYMENT', 'PAID', {
                requestId,
                reason: REASON_ORDER_PAID,
              });
              orderTransitionId = transition.id;
            } else if (settled.order.status !== 'PAID') {
              throw new ConflictException({
                code: ORDER_STATE_CONFLICT_ERROR,
                message: 'Order is no longer payable.',
              });
            }

            const consumedReservations = await this.inventory.consumeReservationsForOrder(tx, orderId, {
              requestId,
            });
            const fulfillment = await tx.fulfillment.upsert({
              where: { orderId },
              create: { orderId },
              update: {},
            });

            await tx.outboxEvent.create({
              data: {
                topic: 'PAYMENT_VERIFIED',
                aggregateType: 'payment',
                aggregateId: payment.id,
                deduplicationKey: `payment-verified:${payment.id}`,
                payload: {
                  paymentId: payment.id,
                  orderId,
                  provider: payment.provider,
                  authority: payment.authority,
                  referenceId,
                  amount: payment.amount.toString(),
                  currency: 'IRR',
                  consumedReservations,
                  fulfillmentId: fulfillment.id,
                  orderStatus: 'PAID',
                },
              },
            });

            await this.auditLog.record(
              {
                action: 'payment.paid',
                entityType: 'payment',
                entityId: payment.id,
                before: { status: 'PENDING' },
                after: {
                  status: 'PAID',
                  referenceId,
                  consumedReservations,
                  fulfillmentId: fulfillment.id,
                },
                metadata: { provider: payment.provider, gatewayEnvironment: payment.gatewayEnvironment },
                requestId,
              },
              tx,
            );
            if (orderTransitionId !== null) {
              await this.auditLog.record(
                {
                  action: 'order.paid',
                  entityType: 'order',
                  entityId: orderId,
                  before: { status: 'PENDING_PAYMENT' },
                  after: { status: 'PAID', consumedReservations },
                  metadata: { paymentId: payment.id, transitionId: orderTransitionId },
                  requestId,
                },
                tx,
              );
            }

            return {
              paymentId: payment.id,
              paymentStatus: 'PAID' as const,
              amount: payment.amount,
              authority: payment.authority ?? '',
              referenceId,
              outcome: 'VERIFIED' as const,
              orderId,
              orderStatus: 'PAID' as const,
              consumedReservations,
              fulfillmentId: fulfillment.id,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private async settleAfterCancellation(
    tx: Prisma.TransactionClient,
    payment: PaymentWithOrder,
    referenceId: string,
    requestId: string,
  ): Promise<VerificationOutcome> {
    const transition = await recordTransition(tx, 'payment', payment.id, 'PENDING', 'PAID', {
      requestId,
      reason: REASON_VERIFIED,
    });
    await tx.payment.update({
      where: { id: payment.id },
      data: { referenceId },
    });
    await tx.outboxEvent.create({
      data: {
        topic: 'PAYMENT_VERIFIED_AFTER_CANCELLED',
        aggregateType: 'payment',
        aggregateId: payment.id,
        deduplicationKey: `payment-verified-after-cancelled:${payment.id}`,
        payload: {
          paymentId: payment.id,
          orderId: payment.orderId,
          provider: payment.provider,
          authority: payment.authority,
          referenceId,
          amount: payment.amount.toString(),
          currency: 'IRR',
          orderStatus: 'CANCELLED',
        },
      },
    });
    await this.auditLog.record(
      {
        action: 'payment.paid.after-order-cancelled',
        entityType: 'payment',
        entityId: payment.id,
        before: { status: 'PENDING' },
        after: { status: 'PAID', referenceId },
        metadata: { provider: payment.provider, transitionId: transition.id },
        requestId,
      },
      tx,
    );
    return {
      paymentId: payment.id,
      paymentStatus: 'PAID' as const,
      amount: payment.amount,
      authority: payment.authority ?? '',
      referenceId,
      outcome: 'VERIFIED_AFTER_CANCELLED' as const,
      orderId: payment.orderId,
      orderStatus: 'CANCELLED' as const,
      consumedReservations: 0,
      fulfillmentId: null,
    };
  }

  private async markNotPaid(
    payment: PaymentWithOrder,
    requestId: string,
  ): Promise<VerificationOutcome> {
    return withSerializableRetry({
      isContention: (error) => error instanceof VerificationContentionError || isPrismaSerializableContention(error),
      conflictMessage: 'Payment changed concurrently; the outcome was not recorded.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const orderId = payment.orderId;
            await this.acquireOrderLock(tx, orderId);
            const current = await tx.payment.findUnique({
              where: { id: payment.id },
              include: { order: { select: { id: true, status: true, grandTotal: true } } },
            });
            if (!current) {
              throw new NotFoundException({
                code: 'NOT_FOUND',
                message: 'Payment not found.',
              });
            }
            if (current.status !== 'PENDING') {
              return this.replayOutcome(current as PaymentWithOrder);
            }

            await recordTransition(tx, 'payment', payment.id, 'PENDING', 'FAILED', {
              requestId,
              reason: REASON_NOT_PAID,
            });
            await tx.outboxEvent.create({
              data: {
                topic: 'PAYMENT_VERIFICATION_FAILED',
                aggregateType: 'payment',
                aggregateId: payment.id,
                deduplicationKey: `payment-verification-failed:${payment.id}`,
                payload: {
                  paymentId: payment.id,
                  orderId,
                  provider: payment.provider,
                  reason: REASON_NOT_PAID,
                  paymentStatus: 'FAILED',
                },
              },
            });
            await this.auditLog.record(
              {
                action: 'payment.failed',
                entityType: 'payment',
                entityId: payment.id,
                before: { status: 'PENDING' },
                after: { status: 'FAILED' },
                metadata: { provider: payment.provider, reason: REASON_NOT_PAID },
                requestId,
              },
              tx,
            );

            return {
              paymentId: payment.id,
              paymentStatus: 'FAILED' as const,
              amount: payment.amount,
              authority: payment.authority ?? '',
              referenceId: null,
              outcome: 'NOT_PAID' as const,
              orderId,
              orderStatus: this.orderStatusOf(current.order.status),
              consumedReservations: 0,
              fulfillmentId: null,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private async recordUnconfirmed(
    payment: PaymentWithOrder,
    requestId: string,
  ): Promise<VerificationOutcome> {
    const deduplicationKey = `payment-verification-unconfirmed:${payment.id}`;
    return withSerializableRetry({
      isContention: (error) => error instanceof VerificationContentionError || isPrismaSerializableContention(error),
      conflictMessage: 'Payment changed concurrently; the reconciliation record was not written.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const current = await tx.payment.findUnique({
              where: { id: payment.id },
              include: { order: { select: { id: true, status: true, grandTotal: true } } },
            });
            if (!current) {
              throw new NotFoundException({
                code: 'NOT_FOUND',
                message: 'Payment not found.',
              });
            }
            if (current.status !== 'PENDING') {
              return this.replayOutcome(current as PaymentWithOrder);
            }

            const existing = await tx.outboxEvent.findUnique({
              where: { deduplicationKey },
            });
            if (existing) {
              return this.unconfirmedOutcome(current as PaymentWithOrder);
            }

            await tx.outboxEvent.create({
              data: {
                topic: 'PAYMENT_VERIFICATION_UNCONFIRMED',
                aggregateType: 'payment',
                aggregateId: payment.id,
                deduplicationKey,
                payload: {
                  paymentId: payment.id,
                  orderId: payment.orderId,
                  provider: payment.provider,
                  authority: payment.authority,
                  amount: payment.amount.toString(),
                  currency: 'IRR',
                  gatewayEnvironment: payment.gatewayEnvironment,
                },
              },
            });
            await this.auditLog.record(
              {
                action: 'payment.verification.unconfirmed',
                entityType: 'payment',
                entityId: payment.id,
                metadata: {
                  provider: payment.provider,
                  reason: REASON_UNCONFIRMED,
                  authority: payment.authority,
                },
                requestId,
              },
              tx,
            );
            return this.unconfirmedOutcome(current as PaymentWithOrder);
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private unconfirmedOutcome(payment: PaymentWithOrder): VerificationOutcome {
    return {
      paymentId: payment.id,
      paymentStatus: 'PENDING' as const,
      amount: payment.amount,
      authority: payment.authority ?? '',
      referenceId: null,
      outcome: 'ACCEPTED_UNCONFIRMED' as const,
      orderId: payment.orderId,
      orderStatus: this.orderStatusOf(payment.order.status),
      consumedReservations: 0,
      fulfillmentId: null,
    };
  }

  private orderStatusOf(status: string): 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' {
    if (status === 'PAID') return 'PAID';
    if (status === 'CANCELLED') return 'CANCELLED';
    return 'PENDING_PAYMENT';
  }

  private asResponse(outcome: VerificationOutcome): PaymentVerificationResponse['data']['verification'] {
    return {
      paymentId: outcome.paymentId,
      status: outcome.paymentStatus,
      provider: this.gateway.providerName,
      amount: { amount: outcome.amount.toString(), currency: 'IRR' },
      authority: outcome.authority,
      ...(outcome.referenceId !== null ? { referenceId: outcome.referenceId } : {}),
      outcome: outcome.outcome,
      orderId: outcome.orderId,
      orderStatus: outcome.orderStatus,
      ...(outcome.consumedReservations > 0 ? { consumedReservations: outcome.consumedReservations } : {}),
      ...(outcome.fulfillmentId !== null ? { fulfillmentId: outcome.fulfillmentId } : {}),
    };
  }

  private async acquireOrderLock(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const [lockHi, lockLo] = advisoryLockIdKey('order', orderId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHi}::int, ${lockLo}::int)`;
  }
}

class VerificationContentionError extends Error {
  readonly code = 'PAYMENT_VERIFICATION_CONTENTION';
}
