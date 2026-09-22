import {
  BadRequestException,
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
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { openApiOrderCommand } from './order-command.openapi';
import { OrderCommandService } from './order-command.service';

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
  @ApiOperation({
    summary: 'Cancel a pending-payment order as staff with reservation compensation',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque retry key, maximum 128 characters.',
  })
  @ApiOkResponse({
    description: 'Cancelled order and released reservation count.',
    schema: openApiOrderCommand.cancelResponse,
  })
  @ApiResponse({ status: 400, schema: openApiOrderCommand.failures.validation })
  @ApiResponse({
    status: 401,
    schema: openApiOrderCommand.failures.unauthorized,
  })
  @ApiResponse({ status: 403, schema: openApiOrderCommand.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiOrderCommand.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiOrderCommand.failures.conflict })
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
  @ApiOperation({
    summary: 'Cancel an owned pending-payment order with reservation compensation',
  })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Opaque retry key, maximum 128 characters.',
  })
  @ApiOkResponse({
    description: 'Cancelled order and released reservation count.',
    schema: openApiOrderCommand.cancelResponse,
  })
  @ApiResponse({ status: 400, schema: openApiOrderCommand.failures.validation })
  @ApiResponse({
    status: 401,
    schema: openApiOrderCommand.failures.unauthorized,
  })
  @ApiResponse({ status: 403, schema: openApiOrderCommand.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiOrderCommand.failures.notFound })
  @ApiResponse({ status: 409, schema: openApiOrderCommand.failures.conflict })
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

function normalizeIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  const hasControlCharacter = [...(key ?? '')].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  });
  if (!key || key.length > 128 || hasControlCharacter) {
    throw new BadRequestException({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key of at most 128 characters is required.',
    });
  }
  return key;
}