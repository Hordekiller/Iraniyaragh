import { Injectable, Logger } from '@nestjs/common';

export const PAYMENT_GATEWAY = 'PAYMENT_GATEWAY';

/**
 * Payment gateway abstraction. The caller (PaymentService) depends only on this
 * interface, never on a concrete provider SDK. A fake/dev provider is wired in
 * for now; a real adapter can be introduced without touching business logic.
 */
export interface CreatePaymentParams {
  paymentId: string;
  orderNumber: string;
  amount: number; // Rial
}

export interface CreatePaymentResult {
  authority: string;
  redirectUrl: string;
}

export interface VerifyPaymentParams {
  authority: string;
  expectedAmount: number; // Rial; amount is verified server-side, never trusted from client/gateway alone
}

export interface VerifyPaymentResult {
  success: boolean;
  status: 'PAID' | 'FAILED';
  amount?: number; // amount the gateway reports was collected
  referenceId?: string;
}

export interface PaymentGateway {
  readonly provider: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult>;
}

@Injectable()
export class FakePaymentGateway implements PaymentGateway {
  readonly provider = 'fake';
  private readonly logger = new Logger(FakePaymentGateway.name);

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    this.logger.log(`[fake-gateway] create payment ${params.paymentId} (${params.amount} Rial)`);
    return {
      authority: `fake-auth-${params.paymentId}`,
      redirectUrl: `/api/v1/payments/verify?authority=fake-auth-${params.paymentId}`,
    };
  }

  async verifyPayment(params: VerifyPaymentParams): Promise<VerifyPaymentResult> {
    this.logger.log(`[fake-gateway] verify authority ${params.authority}`);
    // Dev fake: always "paid" the exact expected amount so the server-side
    // amount check passes. A real provider would report an independent amount.
    return {
      success: true,
      status: 'PAID',
      amount: params.expectedAmount,
      referenceId: `ref-${params.authority}`,
    };
  }
}
