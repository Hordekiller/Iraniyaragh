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
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { OrderCancelResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { openApiOrderCommand } from './order-command.openapi';
import { OrderCommandService } from './order-command.service';

const CancelOrderApi = (summary: string) =>
  applyDecorators(
    ApiOperation({ summary }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description: 'Opaque retry key, maximum 128 characters.',
    }),
    ApiParam({ name: 'id', type: String }),
    ApiOkResponse({
      description: 'Cancelled order and released reservation count.',
      schema: openApiOrderCommand.cancelResponse,
    }),
    ApiResponse({ status: 400, schema: openApiOrderCommand.failures.validation }),
    ApiResponse({
      status: 401,
      schema: openApiOrderCommand.failures.unauthorized,
    }),
    ApiResponse({ status: 403, schema: openApiOrderCommand.failures.forbidden }),
    ApiResponse({ status: 404, schema: openApiOrderCommand.failures.notFound }),
    ApiResponse({ status: 409, schema: openApiOrderCommand.failures.conflict }),
  );

@ApiTags('orders')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders', version: '1' })
export class OrderCommandController {
  constructor(
    @Inject(OrderCommandService) private readonly commands: OrderCommandService,
  ) {}

  @Post('admin/:id/cancel')
  @HttpCode(200)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('orders.manage')
  @CancelOrderApi(
    'Cancel a pending-payment order as staff with reservation compensation',
  )
  cancelAsStaff(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OrderCancelResponse> {
    return this.commands.cancelAsStaff(principal.userId, id, {
      idempotencyKey: normalizeIdempotencyKey(key),
      requestId: getRequestId(),
    });
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequireAuthentication('CUSTOMER_OTP')
  @CancelOrderApi(
    'Cancel an owned pending-payment order with reservation compensation',
  )
  cancelAsCustomer(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<OrderCancelResponse> {
    return this.commands.cancelAsCustomer(principal.userId, id, {
      idempotencyKey: normalizeIdempotencyKey(key),
      requestId: getRequestId(),
    });
  }
}