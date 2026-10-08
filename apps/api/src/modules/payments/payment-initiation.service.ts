import { createHash } from 'node:crypto';
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PaymentInitiationResponse } from '@iranyaragh/contracts';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { advisoryLockIdKey } from '../../common/advisory-lock';
import { ORDER_STATE_CONFLICT_ERROR, recordTransition } from '../../common/state-machine';
import { withSerializableRetry } from '../../common/serializable-retry';
import {
  PAYMENT_GATEWAY_CONFIG,
  PAYMENT_PROVIDER,
  type PaymentGatewayConfig,
  type PaymentProvider,
  type PaymentAuthorizeResult,
} from './payment-provider.port';

const PAYMENT_SCOPE = 'payment.initiation';

type PaymentInitiationInput = {
  userId: string;
  orderId: string;
  idempotencyKey: string;
  requestId: string;
};

type RegisteredAttempt =
  | {
      kind: 'replay';
      payment: {
        paymentId: string;
        authority: string;
        amount: bigint;
        gatewayEnvironment: string;
      };
    }
  | {
      kind: 'authorize';
      paymentId: string;
      orderNumber: string;
      amount: bigint;
    };

type PaymentRow = {
  id: string;
  status: string;
  authority: string | null;
  idempotencyFingerprint: string;
  orderId: string;
  gatewayEnvironment: string;
};

@Injectable()
export class PaymentInitiationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    @Inject(PAYMENT_GATEWAY_CONFIG) private readonly gateway: PaymentGatewayConfig,
  ) {}

  async initiate(input: PaymentInitiationInput): Promise<PaymentInitiationResponse> {
    const attempt = await this.register(input);

    if (attempt.kind === 'replay') {
      return { data: this.asOutcome(attempt.payment) };
    }

    let authorizeResult: PaymentAuthorizeResult;
    try {
      authorizeResult = await this.provider.authorize({
        orderId: input.orderId,
        orderNumber: attempt.orderNumber,
        amountMinorUnits: attempt.amount.toString(),
        currency: 'IRR',
        callbackUrl: this.gateway.callbackUrl,
        correlationId: input.requestId,
      });
    } catch {
      // A thrown transport error cannot prove that the gateway never accepted
      // the request. Keep the durable attempt pending; never log its raw error.
      throw this.unconfirmed();
    }

    if (authorizeResult.status === 'redirect') {
      return this.persistAuthorization(input.orderId, attempt.paymentId, attempt.amount, authorizeResult.authority);
    }

    if (authorizeResult.status === 'unknown_result') throw this.unconfirmed();

    const reasonKey = this.transitionReason(authorizeResult.status);
    await this.markFailed(attempt.paymentId, input.requestId, reasonKey);

    if (authorizeResult.status === 'rejected') {
      throw new UnprocessableEntityException({
        code: 'UNPROCESSABLE',
        message: 'Payment gateway rejected the initiation request.',
      });
    }
    if (authorizeResult.status === 'disabled') {
      // The attempt is recorded FAILED because no gateway call was made, so this
      // specific attempt provably never reached a payment page. Retrying with a
      // new key cannot help while the gateway stays disabled.
      throw new ServiceUnavailableException({
        code: 'PAYMENT_PROVIDER_DISABLED',
        message: 'Payments are not enabled on this deployment.',
      });
    }
    throw new ServiceUnavailableException({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Payment gateway is unavailable; the attempt is recorded as failed. Retry with a new idempotency key.',
    });
  }

  private async register(input: PaymentInitiationInput): Promise<RegisteredAttempt> {
    const { userId, orderId, idempotencyKey, requestId } = input;
    const keyHash = hash(idempotencyKey);
    const fingerprint = hash(
      JSON.stringify({
        scope: PAYMENT_SCOPE,
        orderId,
        provider: this.gateway.providerName,
      }),
    );

    return withSerializableRetry({
      isContention: (error) => error instanceof PaymentInitiationContentionError,
      conflictMessage: 'Payment changed concurrently; retry with the same idempotency key.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const customer = await tx.customer.findUnique({
              where: { userId },
              select: { id: true },
            });
            if (!customer) {
              throw new ConflictException({
                code: 'CONFLICT',
                message: 'Customer profile is not linked to the authenticated user.',
              });
            }

            await this.acquireOrderLock(tx, orderId);

            const order = await tx.order.findUnique({
              where: { id: orderId },
              select: { id: true, number: true, customerId: true, status: true, grandTotal: true, reservationExpiresAt: true },
            });
            if (!order || order.customerId !== customer.id) {
              throw new NotFoundException({
                code: 'ORDER_NOT_FOUND',
                message: 'Order not found.',
              });
            }
            if (order.status !== 'PENDING_PAYMENT' || order.reservationExpiresAt <= new Date()) {
              throw new ConflictException({
                code: ORDER_STATE_CONFLICT_ERROR,
                message: 'Order is no longer payable or its stock reservation expired.',
              });
            }

            const existing = await tx.payment.findUnique({
              where: { idempotencyKey: keyHash },
            });
            if (existing) {
              return this.attemptForExisting(existing, { order, fingerprint, compareFingerprint: true });
            }

            const active = await tx.payment.findFirst({
              where: {
                orderId,
                OR: [
                  { status: 'PENDING' },
                  // Earlier releases misclassified ambiguous authorization as
                  // FAILED. Do not allow a new key to repeat those sends either.
                  { status: 'FAILED', transitions: { some: { reason: { in: ['gateway_unconfirmed', 'gateway_unavailable'] } } } },
                ],
              },
              orderBy: { createdAt: 'asc' },
            });
            if (active) {
              return this.attemptForExisting(active, { order, fingerprint, compareFingerprint: false });
            }

            const payment = await tx.payment.create({
              data: {
                orderId,
                provider: this.gateway.providerName,
                amount: order.grandTotal,
                status: 'PENDING',
                idempotencyKey: keyHash,
                idempotencyFingerprint: fingerprint,
                correlationId: requestId,
                gatewayEnvironment: this.gateway.mode,
              },
            });
            return {
              kind: 'authorize',
              paymentId: payment.id,
              orderNumber: order.number,
              amount: order.grandTotal,
            } satisfies RegisteredAttempt;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private attemptForExisting(
    payment: PaymentRow,
    options: {
      order: { id: string; number: string; grandTotal: bigint };
      fingerprint: string;
      compareFingerprint: boolean;
    },
  ): RegisteredAttempt {
    const { order, fingerprint, compareFingerprint } = options;
    if (compareFingerprint && payment.idempotencyFingerprint !== fingerprint) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key payload conflict.',
      });
    }
    if (!compareFingerprint && payment.status === 'FAILED') throw this.unconfirmed();
    if (payment.status !== 'PENDING') {
      throw new ConflictException({
        code: 'PAYMENT_STATE_CONFLICT',
        message: 'A payment initiation for this order already has a terminal outcome.',
      });
    }
    if (payment.orderId !== order.id) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency key belongs to another order.',
      });
    }
    if (payment.authority === null) {
      // A missing authority cannot distinguish an in-flight call, a crash
      // before sending, or an accepted request whose response was lost.
      // Re-authorizing would issue another external request without evidence.
      throw this.unconfirmed();
    }
    return {
      kind: 'replay',
      payment: {
        paymentId: payment.id,
        authority: payment.authority,
        amount: order.grandTotal,
        gatewayEnvironment: payment.gatewayEnvironment,
      },
    };
  }

  private async persistAuthorization(orderId: string, paymentId: string, amount: bigint, authority: string): Promise<PaymentInitiationResponse> {
    const result = await withSerializableRetry({
      isContention: (error) => error instanceof PaymentInitiationContentionError,
      conflictMessage: 'Payment changed concurrently; reconcile the recorded attempt.',
      operation: () => this.prisma.$transaction(async (tx) => {
        await this.acquireOrderLock(tx, orderId);
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, reservationExpiresAt: true } });
        // Retain the received authority even if cancellation released stock:
        // a later real callback must remain matchable for compensation.
        const claimed = await tx.payment.updateMany({ where: { id: paymentId, status: 'PENDING', authority: null }, data: { authority } });
        const payment = claimed.count === 1
          ? { status: 'PENDING', authority, gatewayEnvironment: this.gateway.mode }
          : await tx.payment.findUnique({ where: { id: paymentId }, select: { status: true, authority: true, gatewayEnvironment: true } });
        const payable = order?.status === 'PENDING_PAYMENT' && order.reservationExpiresAt > new Date() && payment?.status === 'PENDING' && payment.authority !== null;
        return payable && payment ? this.asOutcome({ paymentId, amount, authority: payment.authority!, gatewayEnvironment: payment.gatewayEnvironment }) : null;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }),
    });
    if (!result) throw new ConflictException({ code: ORDER_STATE_CONFLICT_ERROR, message: 'Order changed or its stock reservation expired while authorizing payment.' });
    return { data: result };
  }

  private async markFailed(paymentId: string, requestId: string, reason: string): Promise<void> {
    await withSerializableRetry({
      isContention: (error) => error instanceof PaymentInitiationContentionError,
      conflictMessage: 'Payment state changed concurrently; retry with the same idempotency key.',
      operation: () =>
        this.prisma.$transaction(
          async (tx) => {
            const current = await tx.payment.findUnique({
              where: { id: paymentId },
              select: { status: true },
            });
            if (!current || current.status !== 'PENDING') return;
            await recordTransition(tx, 'payment', paymentId, 'PENDING', 'FAILED', {
              requestId,
              reason,
            });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        ),
    });
  }

  private transitionReason(
    status: 'rejected' | 'unavailable' | 'disabled',
  ): string {
    switch (status) {
      case 'rejected':
        return 'gateway_rejected';
      case 'unavailable':
        return 'gateway_authorization_throttled';
      case 'disabled':
        return 'gateway_disabled';
    }
  }

  private unconfirmed(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'PAYMENT_RESULT_UNCONFIRMED',
      message: 'Payment initiation is pending or unconfirmed; reconcile the recorded attempt before another gateway request.',
    });
  }

  private asOutcome(payment: {
    paymentId: string;
    authority: string;
    amount: bigint;
    gatewayEnvironment: string;
  }): PaymentInitiationResponse['data'] {
    return {
      payment: {
        paymentId: payment.paymentId,
        status: 'PENDING',
        provider: this.gateway.providerName,
        amount: { amount: payment.amount.toString(), currency: 'IRR' },
        authority: payment.authority,
        redirectUrl: `${this.redirectBaseUrl(payment.gatewayEnvironment)}${payment.authority}`,
      },
    };
  }

  private redirectBaseUrl(environment: string): string {
    return environment === 'live'
      ? 'https://payment.zarinpal.com/pg/StartPay/'
      : 'https://sandbox.zarinpal.com/pg/StartPay/';
  }

  private async acquireOrderLock(
    tx: Prisma.TransactionClient,
    orderId: string,
  ): Promise<void> {
    const [lockHi, lockLo] = advisoryLockIdKey('order', orderId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockHi}::int, ${lockLo}::int)`;
  }
}

class PaymentInitiationContentionError extends Error {
  readonly code = 'PAYMENT_INITIATION_CONTENTION';
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
