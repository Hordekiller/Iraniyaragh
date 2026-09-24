import { applyDecorators, Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { PaymentVerificationResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { openApiPaymentVerification } from './payment-verification.openapi';
import { PaymentVerificationService } from './payment-verification.service';

const VerifyCallbackApi = () =>
  applyDecorators(
    ApiOperation({
      summary:
        'Zarinpal redirect callback — always verified server-side; the callback parameters are never treated as payment proof',
    }),
    ApiQuery({ name: 'Authority', required: true, type: String, description: 'Gateway authority token echoed by the redirect.' }),
    ApiQuery({ name: 'Status', required: false, enum: ['OK', 'NOK'], description: 'Gateway-reported intent, re-verified server-side.' }),
    ApiResponse({
      status: 200,
      description: 'Verification outcome.',
      schema: openApiPaymentVerification.verificationResponse,
    }),
    ApiResponse({ status: 400, schema: openApiPaymentVerification.failures.validation }),
    ApiResponse({ status: 404, schema: openApiPaymentVerification.failures.notFound }),
    ApiResponse({ status: 409, schema: openApiPaymentVerification.failures.conflict }),
    ApiResponse({ status: 503, schema: openApiPaymentVerification.failures.serviceUnavailable }),
  );

@ApiTags('payments')
@Controller({ path: 'payments/zarinpal', version: '1' })
export class ZarinpalCallbackController {
  constructor(private readonly verification: PaymentVerificationService) {}

  /** Public route: the buyer's browser is redirected here by the gateway. */
  @Get('callback')
  @VerifyCallbackApi()
  async callback(
    @Query('Authority') authority: string | undefined,
    @Query('Status') status: string | undefined,
  ): Promise<PaymentVerificationResponse> {
    const normalized = status === undefined ? undefined : status.toUpperCase();
    return this.verification.verify({
      authority: authority ?? '',
      status: normalized,
      requestId: getRequestId(),
    });
  }
}
