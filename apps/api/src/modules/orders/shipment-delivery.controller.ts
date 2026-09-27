import { Body, Controller, Headers, HttpCode, Inject, Param, Post, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { ShipmentDeliveryDto } from './shipment-delivery.dto';
import { openApiShipmentDelivery } from './shipment-delivery.openapi';
import { ShipmentDeliveryService } from './shipment-delivery.service';

const bodyPipe = new ValidationPipe({ expectedType: ShipmentDeliveryDto, whitelist: true, forbidNonWhitelisted: true, transform: true });

@ApiTags('shipments')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders/admin/:id/shipment', version: '1' })
export class ShipmentDeliveryController {
  constructor(@Inject(ShipmentDeliveryService) private readonly delivery: ShipmentDeliveryService) {}

  @Post('deliver')
  @HttpCode(200)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('shipments.manage')
  @ApiOperation({ summary: 'Staff-attested delivery of a dispatched shipment with proof reference' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: openApiShipmentDelivery.body })
  @ApiResponse({ status: 200, schema: openApiShipmentDelivery.result })
  @ApiResponse({ status: 400, schema: openApiShipmentDelivery.error })
  @ApiResponse({ status: 401, schema: openApiShipmentDelivery.error })
  @ApiResponse({ status: 403, schema: openApiShipmentDelivery.error })
  @ApiResponse({ status: 404, schema: openApiShipmentDelivery.error })
  @ApiResponse({ status: 409, schema: openApiShipmentDelivery.error })
  confirm(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Body(bodyPipe) body: ShipmentDeliveryDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.delivery.confirm(id, body, {
      actorId: principal.userId, requestId: getRequestId(), idempotencyKey: normalizeIdempotencyKey(key),
    });
  }
}
