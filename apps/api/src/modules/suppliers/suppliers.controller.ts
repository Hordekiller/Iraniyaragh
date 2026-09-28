import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import type { Supplier, SupplierAuditResponse, SupplierListResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { SupplierCreateDto, SupplierListQueryDto, SupplierUpdateDto } from './suppliers.dto';
import { suppliersOpenApi } from './suppliers.openapi';
import { SuppliersService } from './suppliers.service';

@Controller({ path: 'suppliers', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  @RequirePermission('suppliers.read')
  @ApiOperation({ summary: 'List suppliers' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: suppliersOpenApi.list })
  list(@Query() query: SupplierListQueryDto): Promise<SupplierListResponse> { return this.suppliers.list(query); }

  @Get(':id')
  @RequirePermission('suppliers.read')
  @ApiOperation({ summary: 'Get supplier' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: suppliersOpenApi.supplier })
  get(@Param('id') id: string): Promise<Supplier> { return this.suppliers.get(id); }

  @Get(':id/history')
  @RequirePermission('suppliers.read')
  @ApiOperation({ summary: 'List supplier lifecycle audit events' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: suppliersOpenApi.history })
  history(@Param('id') id: string, @Query() query: SupplierListQueryDto): Promise<SupplierAuditResponse> { return this.suppliers.history(id, query); }

  @Post()
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Create a supplier' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: suppliersOpenApi.create })
  @ApiCreatedResponse({ schema: suppliersOpenApi.supplier })
  create(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Body() input: SupplierCreateDto): Promise<Supplier> {
    return this.suppliers.create(input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }

  @Patch(':id')
  @RequirePermission('suppliers.manage')
  @ApiOperation({ summary: 'Update or deactivate a supplier with optimistic concurrency' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: suppliersOpenApi.update })
  @ApiOkResponse({ schema: suppliersOpenApi.supplier })
  update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: SupplierUpdateDto): Promise<Supplier> {
    return this.suppliers.update(id, input, { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key });
  }
}
