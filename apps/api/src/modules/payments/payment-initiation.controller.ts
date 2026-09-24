import {
  applyDecorators,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { PaymentInitiationResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { openApiPaymentInitiation } from './payment-initiation.openapi';
import { PaymentInitiationService } from './payment-initiation.service';

const InitiatePaymentApi = () =>
  applyDecorators(
    ApiOperation({
      summary:
        'Initiate payment for an owned pending-payment order (server amounts only)',
    }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Opaque retry key, maximum 128 characters.',
    }),
    ApiParam({ name: 'orderId', type: String }),
    ApiResponse({
      status: 200,
      description: 'Payment initiation with a server-issued redirect to the gateway.',
      schema: openApiPaymentInitiation.initiationResponse,
    }),
    ApiResponse({ status: 400, schema: openApiPaymentInitiation.failures.validation }),
    ApiResponse({ status: 401, schema: openApiPaymentInitiation.failures.unauthorized }),
    ApiResponse({ status: 403, schema: openApiPaymentInitiation.failures.forbidden }),
    ApiResponse({ status: 404, schema: openApiPaymentInitiation.failures.notFound }),
    ApiResponse({ status: 409, schema: openApiPaymentInitiation.failures.conflict }),
    ApiResponse({ status: 422, schema: openApiPaymentInitiation.failures.unprocessable }),
    ApiResponse({ status: 503, schema: openApiPaymentInitiation.failures.serviceUnavailable }),
  );

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders', version: '1' })
export class PaymentInitiationController {
  constructor(
    @Inject(PaymentInitiationService) private readonly payments: PaymentInitiationService,
  ) {}

  @Post(':orderId/pay')
  @HttpCode(200)
  @RequireAuthentication('CUSTOMER_OTP')
  @InitiatePaymentApi()
  initiate(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<PaymentInitiationResponse> {
    return this.payments.initiate({
      userId: principal.userId,
      orderId,
      idempotencyKey: normalizeIdempotencyKey(key),
      requestId: getRequestId(),
    });
  }
}