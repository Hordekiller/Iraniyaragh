import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type {
  AdminCustomerAuditResponse,
  AdminCustomerDetailResponse,
  AdminCustomerListResponse,
  AdminCustomerSummary,
  OrderListMeta,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { customersOpenApi } from './customers.openapi';
import {
  CustomerAddressesDto,
  CustomerCreateDto,
  CustomerListQueryDto,
  CustomerNoteDto,
  CustomerUpdateDto,
} from './customers.dto';
import { CustomersService } from './customers.service';

@Controller({ path: 'customers/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission('customers.read')
  @ApiOperation({ summary: 'List staff-managed customers' })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['ACTIVE', 'INACTIVE'] })
  @ApiQuery({ name: 'hasUserAccount', required: false, type: Boolean })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'updatedAt', 'mobile', 'firstName', 'lastName', 'orderCount'] })
  @ApiQuery({ name: 'sortDir', required: false, enum: ['ASC', 'DESC'] })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: customersOpenApi.list })
  @ApiForbiddenResponse({ description: 'Missing customers.read' })
  async list(@Query() query: CustomerListQueryDto): Promise<AdminCustomerListResponse> {
    const { items, total } = await this.customers.list(query);
    return { data: { items, meta: meta(total, query) } };
  }

  @Get(':id')
  @RequirePermission('customers.read')
  @ApiOperation({ summary: 'Get a customer with addresses, notes and recent orders' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: customersOpenApi.detail })
  @ApiNotFoundResponse({ description: 'Customer not found' })
  @ApiForbiddenResponse({ description: 'Missing customers.read' })
  async get(@Param('id') id: string): Promise<AdminCustomerDetailResponse> {
    return { data: { customer: await this.customers.get(id) } };
  }

  @Get(':id/history')
  @RequirePermission('customers.read')
  @ApiOperation({ summary: 'List customer lifecycle audit events' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: customersOpenApi.history })
  async history(@Param('id') id: string, @Query() query: CustomerListQueryDto): Promise<AdminCustomerAuditResponse> {
    const { items, total } = await this.customers.history(id, query);
    return { data: { items, meta: meta(total, query) } };
  }

  @Post()
  @RequirePermission('customers.manage')
  @ApiOperation({ summary: 'Create a staff-managed customer' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.create })
  @ApiCreatedResponse({ schema: customersOpenApi.summary })
  @ApiBadRequestResponse({ description: 'Invalid Iranian mobile' })
  @ApiForbiddenResponse({ description: 'Missing customers.manage' })
  async create(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Body() input: CustomerCreateDto,
  ): Promise<{ data: { customer: AdminCustomerSummary } }> {
    return { data: { customer: await this.customers.create(input, context(principal, key)) } };
  }

  @Patch(':id')
  @RequirePermission('customers.manage')
  @ApiOperation({ summary: 'Update customer name fields with optimistic concurrency' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.update })
  @ApiOkResponse({ schema: customersOpenApi.summary })
  @ApiForbiddenResponse({ description: 'Missing customers.manage' })
  async update(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: CustomerUpdateDto,
  ): Promise<{ data: { customer: AdminCustomerSummary } }> {
    return { data: { customer: await this.customers.update(id, input, context(principal, key)) } };
  }

  @Put(':id/addresses')
  @RequirePermission('customers.manage')
  @ApiOperation({ summary: 'Replace the customer address set and optionally change lifecycle status' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.addresses })
  @ApiOkResponse({ schema: customersOpenApi.detail })
  @ApiForbiddenResponse({ description: 'Missing customers.manage' })
  async replaceAddresses(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: CustomerAddressesDto,
  ): Promise<AdminCustomerDetailResponse> {
    return { data: { customer: await this.customers.replaceAddresses(id, input, context(principal, key)) } };
  }

  @Post(':id/notes')
  @RequirePermission('customers.manage')
  @ApiOperation({ summary: 'Append a customer-visible or internal note' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: customersOpenApi.note })
  @ApiCreatedResponse({ schema: customersOpenApi.detail })
  @ApiForbiddenResponse({ description: 'Missing customers.manage' })
  async addNote(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Headers('idempotency-key') key: string,
    @Param('id') id: string,
    @Body() input: CustomerNoteDto,
  ): Promise<AdminCustomerDetailResponse> {
    return { data: { customer: await this.customers.addNote(id, input, context(principal, key)) } };
  }
}

function context(principal: AuthPrincipalContext, idempotencyKey: string) {
  return { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey };
}

function meta(total: number, query: CustomerListQueryDto): OrderListMeta {
  return { page: query.page, perPage: query.perPage, total, pages: Math.max(1, Math.ceil(total / query.perPage)) };
}
