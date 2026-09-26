import { Body, Controller, Headers, HttpCode, Inject, Param, Post, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { ShipmentDispatchDto } from './shipment-dispatch.dto';
import { openApiShipmentDispatch } from './shipment-dispatch.openapi';
import { ShipmentDispatchService } from './shipment-dispatch.service';

const bodyPipe = new ValidationPipe({ expectedType: ShipmentDispatchDto, whitelist: true, forbidNonWhitelisted: true, transform: true });

@ApiTags('shipments')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders/admin/:id/shipment', version: '1' })
export class ShipmentDispatchController {
  constructor(@Inject(ShipmentDispatchService) private readonly shipments: ShipmentDispatchService) {}

  @Post('dispatch')
  @HttpCode(200)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('shipments.manage')
  @ApiOperation({ summary: 'Dispatch one complete, picked package with manual carrier tracking' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: openApiShipmentDispatch.body })
  @ApiResponse({ status: 200, schema: openApiShipmentDispatch.result })
  @ApiResponse({ status: 400, schema: openApiShipmentDispatch.error })
  @ApiResponse({ status: 401, schema: openApiShipmentDispatch.error })
  @ApiResponse({ status: 403, schema: openApiShipmentDispatch.error })
  @ApiResponse({ status: 404, schema: openApiShipmentDispatch.error })
  @ApiResponse({ status: 409, schema: openApiShipmentDispatch.error })
  dispatch(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Body(bodyPipe) body: ShipmentDispatchDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.shipments.dispatch(id, body, {
      actorId: principal.userId, requestId: getRequestId(), idempotencyKey: normalizeIdempotencyKey(key),
    });
  }
}
