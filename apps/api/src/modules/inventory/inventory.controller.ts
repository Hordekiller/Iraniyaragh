import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { getRequestId } from '../../common/request-context';
import { InventoryService } from './inventory.service';
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
  WarehouseCreateDto,
  WarehouseUpdateDto,
} from './inventory.dto';

@Controller({ path: 'inventory', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('balances')
  @RequirePermission('inventory.read')
  async balances(@Query() query: InventorySnapshotQueryDto) { return this.inventory.getSnapshots(query); }

  @Get('movements')
  @RequirePermission('inventory.read')
  async movements(@Query() query: InventoryMovementQueryDto) { return this.inventory.getMovements(query); }

  @Post('changes')
  @RequirePermission('inventory.adjust')
  async change(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: InventoryChangeDto) {
    return this.inventory.changeOnHand({ ...input, idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('warehouses')
  @RequirePermission('inventory.read')
  async warehouses(@Query() query: TransferListQueryDto) { return this.inventory.listWarehouses(query); }

  @Post('warehouses')
  @RequirePermission('inventory.adjust')
  async createWarehouse(@CurrentPrincipal() principal: AuthPrincipalContext, @Body() input: WarehouseCreateDto) {
    return this.inventory.createWarehouse({ ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Patch('warehouses/:id')
  @RequirePermission('inventory.adjust')
  async updateWarehouse(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: WarehouseUpdateDto) {
    return this.inventory.updateWarehouse(id, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('warehouses/:warehouseId/locations')
  @RequirePermission('inventory.read')
  async locations(@Param('warehouseId') warehouseId: string, @Query() query: TransferListQueryDto) { return this.inventory.listLocations(warehouseId, query); }

  @Post('warehouses/:warehouseId/locations')
  @RequirePermission('inventory.adjust')
  async createLocation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('warehouseId') warehouseId: string, @Body() input: LocationCreateDto) {
    return this.inventory.createLocation(warehouseId, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Patch('locations/:id')
  @RequirePermission('inventory.adjust')
  async updateLocation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: LocationUpdateDto) {
    return this.inventory.updateLocation(id, { ...input, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('reservations')
  @RequirePermission('inventory.read')
  async reservations(@Query() query: ReservationListQueryDto) { return this.inventory.getReservations(query); }

  @Post('reservations')
  @RequirePermission('inventory.adjust')
  async reserve(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: InventoryReservationDto) {
    return this.inventory.reserve({ ...input, expiresAt: new Date(input.expiresAt), idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('reservations/:id/release')
  @RequirePermission('inventory.adjust')
  async releaseReservation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: InventoryLifecycleDto) {
    return this.inventory.releaseReservation(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('reservations/:id/consume')
  @RequirePermission('inventory.adjust')
  async consumeReservation(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: InventoryLifecycleDto) {
    return this.inventory.consumeReservation(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('transfers')
  @RequirePermission('inventory.transfer')
  async transfers(@Query() query: TransferListQueryDto) { return this.inventory.getTransfers(query); }

  @Post('transfers')
  @RequirePermission('inventory.transfer')
  async createTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') idempotencyKey: string | undefined, @Body() input: TransferCreateDto) {
    return this.inventory.createTransfer({ ...input, idempotencyKey, actorId: principal.userId, requestId: getRequestId() });
  }

  @Get('transfers/:id')
  @RequirePermission('inventory.transfer')
  async getTransfer(@Param('id') id: string) { return this.inventory.getTransfer(id); }

  @Post('transfers/:id/request')
  @RequirePermission('inventory.transfer')
  async requestTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto) {
    return this.inventory.requestTransfer(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/approve')
  @RequirePermission('inventory.approve')
  async approveTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto) {
    return this.inventory.approveTransfer(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/dispatch')
  @RequirePermission('inventory.transfer')
  async dispatchTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto) {
    return this.inventory.dispatchTransfer(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/receive')
  @RequirePermission('inventory.transfer')
  async receiveTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto) {
    return this.inventory.receiveTransfer(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }

  @Post('transfers/:id/cancel')
  @RequirePermission('inventory.transfer')
  async cancelTransfer(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Body() input: TransferActionDto) {
    return this.inventory.cancelTransfer(id, { expectedVersion: input.expectedVersion, actorId: principal.userId, requestId: getRequestId() });
  }
}