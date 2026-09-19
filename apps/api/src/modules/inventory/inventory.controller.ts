import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { InventoryMovementType, ReservationStatus, TransferStatus } from '@prisma/client';
import type {
  InventoryBalanceListResponse,
  InventoryMovement,
  InventoryMovementListResponse,
} from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { getRequestId } from '../../common/request-context';
import { InventoryService } from './inventory.service';
import { openApiInventory } from './inventory.openapi';
import {
  InventoryChangeDto,
  InventoryLifecycleDto,
  InventoryMovementQueryDto,
  InventoryReservationDto,
  InventorySnapshotQueryDto,
  LocationCreateDto,
  LocationUpdateDto,
  ReservationListQueryDto,
  TransferActionDto,
  TransferCreateDto,
  TransferListQueryDto,
  WarehouseListQueryDto,
  LocationListQueryDto,
  WarehouseCreateDto,
  WarehouseUpdateDto,
} from './inventory.dto';

@Controller({ path: 'inventory', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List warehouse/location inventory balances' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'locationId', required: false, type: String })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.balanceList })
  async balances(@Query() query: InventorySnapshotQueryDto): Promise<InventoryBalanceListResponse> {
    return this.inventory.getSnapshots(query);
  }

  @Get('movements')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List immutable inventory movements' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'locationId', required: false, type: String })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, enum: Object.values(InventoryMovementType) })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.movementList })
  async movements(@Query() query: InventoryMovementQueryDto): Promise<InventoryMovementListResponse> {
    return this.inventory.getMovements(query);
  }

  @Post('changes')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Apply an audited inventory receipt or adjustment' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried stock commands.' })
  @ApiBody({ schema: openApiInventory.inventoryChange })
  @ApiCreatedResponse({ schema: openApiInventory.movement })
  async change(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: InventoryChangeDto): Promise<InventoryMovement> {
    return this.inventory.changeOnHand({ ...input, idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('warehouses')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List warehouses' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'isInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.warehouseList })
  async warehouses(@Query() query: WarehouseListQueryDto) { return this.inventory.listWarehouses(query); }

  @Post('warehouses')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Create a warehouse' })
  @ApiBody({ schema: openApiInventory.warehouseCreate })
  @ApiCreatedResponse({ schema: openApiInventory.warehouse })
  async createWarehouse(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: WarehouseCreateDto) {
    return this.inventory.createWarehouse({ ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Patch('warehouses/:id')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Update a warehouse' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiInventory.warehouseUpdate })
  @ApiOkResponse({ schema: openApiInventory.warehouse })
  async updateWarehouse(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: WarehouseUpdateDto) {
    return this.inventory.updateWarehouse(id, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('warehouses/:warehouseId/locations')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List warehouse locations' })
  @ApiParam({ name: 'warehouseId', type: String })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'isInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.locationList })
  async locations(@Param('warehouseId') warehouseId: string, @Query() query: LocationListQueryDto) { return this.inventory.listLocations(warehouseId, query); }

  @Post('warehouses/:warehouseId/locations')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Create a warehouse location' })
  @ApiParam({ name: 'warehouseId', type: String })
  @ApiBody({ schema: openApiInventory.locationCreate })
  @ApiCreatedResponse({ schema: openApiInventory.location })
  async createLocation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('warehouseId') warehouseId: string, @Body() input: LocationCreateDto) {
    return this.inventory.createLocation(warehouseId, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Patch('locations/:id')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Update a warehouse location' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiInventory.locationUpdate })
  @ApiOkResponse({ schema: openApiInventory.location })
  async updateLocation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: LocationUpdateDto) {
    return this.inventory.updateLocation(id, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('reservations')
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'List stock reservations' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'variantId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(ReservationStatus) })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.reservationList })
  async reservations(@Query() query: ReservationListQueryDto) { return this.inventory.getReservations(query); }

  @Post('reservations')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Reserve available stock' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried reservation commands.' })
  @ApiBody({ schema: openApiInventory.reservationCreate })
  @ApiCreatedResponse({ schema: openApiInventory.reservation })
  async reserve(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: InventoryReservationDto) {
    return this.inventory.reserve({ ...input, expiresAt: new Date(input.expiresAt), idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('reservations/:id/release')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Release an active stock reservation' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiInventory.lifecycle })
  @ApiCreatedResponse({ schema: openApiInventory.reservation })
  async releaseReservation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: InventoryLifecycleDto) {
    return this.inventory.releaseReservation(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('reservations/:id/consume')
  @RequirePermission('inventory.adjust')
  @ApiOperation({ summary: 'Consume an active stock reservation' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiInventory.lifecycle })
  @ApiCreatedResponse({ schema: openApiInventory.reservation })
  async consumeReservation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: InventoryLifecycleDto) {
    return this.inventory.consumeReservation(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('transfers')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'List stock transfers' })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(TransferStatus) })
  @ApiQuery({ name: 'sourceWarehouseId', required: false, type: String })
  @ApiQuery({ name: 'targetWarehouseId', required: false, type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: openApiInventory.transferList })
  async transfers(@Query() query: TransferListQueryDto) { return this.inventory.getTransfers(query); }

  @Post('transfers')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Create a draft stock transfer' })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer creation.' })
  @ApiBody({ schema: openApiInventory.transferCreate })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async createTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: TransferCreateDto) {
    return this.inventory.createTransfer({ ...input, idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('transfers/:id')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Get a stock transfer' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: openApiInventory.transfer })
  async getTransfer(@Param('id') id: string) { return this.inventory.getTransfer(id); }

  @Post('transfers/:id/request')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Request approval for a draft transfer' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer transitions.' })
  @ApiBody({ schema: openApiInventory.transferAction })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async requestTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.requestTransfer(id, { expectedVersion: input.expectedVersion, ...(idempotencyKey ? { idempotencyKey } : {}), actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/approve')
  @RequirePermission('inventory.approve')
  @ApiOperation({ summary: 'Approve a requested transfer' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer transitions.' })
  @ApiBody({ schema: openApiInventory.transferAction })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async approveTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.approveTransfer(id, { expectedVersion: input.expectedVersion, ...(idempotencyKey ? { idempotencyKey } : {}), actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/dispatch')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Dispatch an approved transfer' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer transitions.' })
  @ApiBody({ schema: openApiInventory.transferAction })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async dispatchTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.dispatchTransfer(id, { expectedVersion: input.expectedVersion, ...(idempotencyKey ? { idempotencyKey } : {}), actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/receive')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Receive an in-transit transfer' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer transitions.' })
  @ApiBody({ schema: openApiInventory.transferAction })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async receiveTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.receiveTransfer(id, { expectedVersion: input.expectedVersion, ...(idempotencyKey ? { idempotencyKey } : {}), actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/cancel')
  @RequirePermission('inventory.transfer')
  @ApiOperation({ summary: 'Cancel a transfer before dispatch' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Required for safely retried transfer transitions.' })
  @ApiBody({ schema: openApiInventory.transferAction })
  @ApiCreatedResponse({ schema: openApiInventory.transfer })
  async cancelTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.inventory.cancelTransfer(id, { expectedVersion: input.expectedVersion, ...(idempotencyKey ? { idempotencyKey } : {}), actorId: principal.userId, requestId: getRequestId() });
  }
}
