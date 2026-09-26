import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import type { AdminRefundResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import {
  CurrentPrincipal,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { AdminPaymentRefundDto } from './admin-payment-refund.dto';
import { AdminPaymentRefundService } from './admin-payment-refund.service';
import { openApiAdminRefund } from './admin-payment-refund.openapi';

// The test transform does not emit `design:paramtypes`, so the body type is
// bound explicitly instead of relying on reflected parameter metadata.
const bodyPipe = new ValidationPipe({
  expectedType: AdminPaymentRefundDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller({ path: 'payments/admin', version: '1' })
export class AdminPaymentRefundController {
  constructor(
    @Inject(AdminPaymentRefundService)
    private readonly refunds: AdminPaymentRefundService,
  ) {}

  @Post(':id/refund')
  @HttpCode(200)
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('payments.refund')
  @ApiOperation({
    summary:
      'Record a refund that staff already performed in the gateway panel (the gateway has no refund API)',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque retry key, maximum 128 characters.',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiAdminRefund.requestBody as SchemaObject })
  @ApiResponse({ status: 200, schema: openApiAdminRefund.response })
  @ApiResponse({ status: 400, schema: openApiAdminRefund.failure })
  @ApiResponse({ status: 401, schema: openApiAdminRefund.failure })
  @ApiResponse({ status: 403, schema: openApiAdminRefund.failure })
  @ApiResponse({ status: 404, schema: openApiAdminRefund.failure })
  @ApiResponse({ status: 409, schema: openApiAdminRefund.failure })
  @ApiResponse({ status: 422, schema: openApiAdminRefund.failure })
  record(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') paymentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(bodyPipe) body: AdminPaymentRefundDto,
  ): Promise<AdminRefundResponse> {
    return this.refunds.record({
      paymentId,
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
      ...body,
    });
  }
}
