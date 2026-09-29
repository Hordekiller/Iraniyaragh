import { Controller, Get, Inject, Param, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  AdminShipmentDetailResponse,
  AdminShipmentListResponse,
} from '@iranyaragh/contracts';
import { RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import {
  AdminShipmentListQueryDto,
  SHIPMENT_STATUS_VALUES,
} from './shipment-read.dto';
import { openApiShipmentRead } from './shipment-read.openapi';
import { ShipmentReadService } from './shipment-read.service';

const queryPipe = new ValidationPipe({
  expectedType: AdminShipmentListQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('shipments')
@ApiBearerAuth('access-token')
@Controller({ path: 'shipments', version: '1' })
export class ShipmentReadController {
  constructor(@Inject(ShipmentReadService) private readonly shipments: ShipmentReadService) {}

  @Get('admin')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('shipments.read')
  @ApiOperation({ summary: 'List dispatched shipments with filters and pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 10_000 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'status', required: false, enum: [...SHIPMENT_STATUS_VALUES] })
  @ApiQuery({ name: 'carrier', required: false, type: String, maxLength: 80 })
  @ApiQuery({ name: 'trackingCode', required: false, type: String, maxLength: 120 })
  @ApiQuery({ name: 'dispatchedFrom', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'dispatchedTo', required: false, type: String, format: 'date-time' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['dispatchedAt', 'orderNumber', 'carrier'] })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['asc', 'desc'] })
  @ApiOkResponse({ schema: openApiShipmentRead.list })
  @ApiResponse({ status: 400, schema: openApiShipmentRead.failures.validation })
  @ApiResponse({ status: 401, schema: openApiShipmentRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiShipmentRead.failures.forbidden })
  list(
    @Query(queryPipe) query: AdminShipmentListQueryDto,
  ): Promise<AdminShipmentListResponse> {
    return this.shipments.listShipments(query);
  }

  @Get('admin/:id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('shipments.read')
  @ApiOperation({ summary: 'Read one shipment with masked address, dispatcher and lines' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: openApiShipmentRead.detail })
  @ApiResponse({ status: 401, schema: openApiShipmentRead.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiShipmentRead.failures.forbidden })
  @ApiResponse({ status: 404, schema: openApiShipmentRead.failures.notFound })
  get(@Param('id') id: string): Promise<AdminShipmentDetailResponse> {
    return this.shipments.getShipment(id);
  }
}
