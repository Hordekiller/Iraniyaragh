import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PurchaseOrderStatus } from '@prisma/client';
import type { PurchaseOrder, PurchaseOrderAuditResponse, PurchaseOrderListResponse, PurchaseOrderOptionsResponse, PurchaseReceipt, PurchaseReceiptListResponse, PurchaseReceiptLocationOptionsResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { PurchaseOrderActionDto, PurchaseOrderCreateDto, PurchaseOrderHistoryQueryDto, PurchaseOrderListQueryDto, PurchaseOrderOptionsQueryDto, PurchaseOrderUpdateDto, PurchaseReceiptCreateDto, PurchaseReceiptLocationQueryDto } from './purchasing.dto';
import { purchasingOpenApi } from './purchasing.openapi';
import { PurchasingService } from './purchasing.service';

@Controller({ path: 'purchase-orders', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class PurchasingController {
  constructor(private readonly purchasing: PurchasingService) {}

  @Get()
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'List purchase orders' })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(PurchaseOrderStatus) })
  @ApiQuery({ name: 'supplierId', required: false, type: String })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: purchasingOpenApi.list })
  list(@Query() query: PurchaseOrderListQueryDto): Promise<PurchaseOrderListResponse> { return this.purchasing.list(query); }

  @Get('options')
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'Select active suppliers, warehouses or SKUs for purchase orders' })
  @ApiQuery({ name: 'kind', required: true, enum: ['supplier', 'warehouse', 'variant'] })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 80 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: purchasingOpenApi.options })
  options(@Query() query: PurchaseOrderOptionsQueryDto): Promise<PurchaseOrderOptionsResponse> { return this.purchasing.options(query); }

  @Get(':id')
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'Get purchase order and line cost snapshot' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: purchasingOpenApi.order })
  get(@Param('id') id: string): Promise<PurchaseOrder> { return this.purchasing.get(id); }

  @Get(':id/history')
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'Get purchase order lifecycle audit events' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: purchasingOpenApi.history })
  history(@Param('id') id: string, @Query() query: PurchaseOrderHistoryQueryDto): Promise<PurchaseOrderAuditResponse> { return this.purchasing.history(id, query); }

  @Get(':id/receipts')
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'List immutable goods receipts for a purchase order' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: purchasingOpenApi.receipts })
  receipts(@Param('id') id: string, @Query() query: PurchaseOrderHistoryQueryDto): Promise<PurchaseReceiptListResponse> { return this.purchasing.receipts(id, query); }

  @Get(':id/receipt-locations')
  @RequirePermission('purchasing.read')
  @ApiOperation({ summary: 'Select active receipt locations in this purchase order warehouse' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 80 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: purchasingOpenApi.receiptLocations })
  receiptLocations(@Param('id') id: string, @Query() query: PurchaseReceiptLocationQueryDto): Promise<PurchaseReceiptLocationOptionsResponse> {
    return this.purchasing.receiptLocations(id, query);
  }

  @Post()
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Create a draft purchase order' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: purchasingOpenApi.create })
  @ApiCreatedResponse({ schema: purchasingOpenApi.order })
  create(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Body() input: PurchaseOrderCreateDto): Promise<PurchaseOrder> {
    return this.purchasing.create(input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }

  @Patch(':id')
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Edit a draft purchase order with version precondition' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: purchasingOpenApi.update })
  @ApiOkResponse({ schema: purchasingOpenApi.order })
  update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: PurchaseOrderUpdateDto): Promise<PurchaseOrder> {
    return this.purchasing.update(id, input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }

  @Post(':id/approve')
  @RequirePermission('purchasing.approve')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Approve a reviewed draft; lines become immutable' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: purchasingOpenApi.action })
  @ApiCreatedResponse({ schema: purchasingOpenApi.order })
  approve(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: PurchaseOrderActionDto): Promise<PurchaseOrder> {
    return this.purchasing.approve(id, input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }

  @Post(':id/cancel')
  @RequirePermission('purchasing.manage')
  @ApiOperation({ summary: 'Cancel an unreceived draft or approved purchase order' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: purchasingOpenApi.action })
  @ApiCreatedResponse({ schema: purchasingOpenApi.order })
  cancel(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: PurchaseOrderActionDto): Promise<PurchaseOrder> {
    return this.purchasing.cancel(id, input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }

  @Post(':id/receipts')
  @RequirePermission('purchasing.receive')
  @ApiOperation({ summary: 'Receive approved purchase order goods into inventory ledger' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: purchasingOpenApi.receive })
  @ApiCreatedResponse({ schema: purchasingOpenApi.receipt })
  receive(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: PurchaseReceiptCreateDto): Promise<PurchaseReceipt> {
    return this.purchasing.receive(id, input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }
}
