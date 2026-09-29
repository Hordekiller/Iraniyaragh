import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { StocktakeStatus } from '@prisma/client';
import type { StocktakeAuditResponse, StocktakeDetail, StocktakeListResponse, StocktakeLocationOptionsResponse, StocktakeVariantOptionsResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { StocktakeActionDto, StocktakeCountDto, StocktakeCreateDto, StocktakeHistoryQueryDto, StocktakeListQueryDto, StocktakeLocationQueryDto, StocktakeVariantQueryDto } from './stocktake.dto';
import { stocktakeOpenApi } from './stocktake.openapi';
import { StocktakeService, type StocktakeContext } from './stocktake.service';

@Controller({ path: 'stocktakes', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class StocktakeController {
  constructor(private readonly stocktake: StocktakeService) {}

  /**
   * Blind counting: a principal without `stocktake.approve` must not receive
   * `expectedQty` or `difference`, otherwise the count is anchored on the
   * system number.
   */
  private context(principal: AuthPrincipalContext, key: string): StocktakeContext {
    return { actorId: principal.userId, requestId: getRequestId() ?? null, idempotencyKey: key,
      canApprove: principal.permissions.has('stocktake.approve') };
  }

  @Get()
  @RequirePermission('stocktake.read')
  @ApiOperation({ summary: 'List stocktakes' })
  @ApiQuery({ name: 'status', required: false, enum: Object.values(StocktakeStatus) })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: stocktakeOpenApi.list })
  list(@CurrentPrincipal() principal: AuthPrincipalContext, @Query() query: StocktakeListQueryDto): Promise<StocktakeListResponse> {
    return this.stocktake.list(query, this.context(principal, 'x'));
  }

  @Get('locations')
  @RequirePermission('stocktake.read')
  @ApiOperation({ summary: 'Select active warehouse locations to count' })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 80 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: stocktakeOpenApi.locations })
  locations(@Query() query: StocktakeLocationQueryDto): Promise<StocktakeLocationOptionsResponse> {
    return this.stocktake.locations(query);
  }

  @Get('variants')
  @RequirePermission('stocktake.read')
  @ApiOperation({ summary: 'Select active SKUs to count' })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 80 })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 50 })
  @ApiOkResponse({ schema: stocktakeOpenApi.variants })
  variants(@Query() query: StocktakeVariantQueryDto): Promise<StocktakeVariantOptionsResponse> {
    return this.stocktake.variants(query);
  }

  @Get(':id')
  @RequirePermission('stocktake.read')
  @ApiOperation({ summary: 'Get a stocktake with its count sheet' })
  @ApiParam({ name: 'id', type: String })
  @ApiOkResponse({ schema: stocktakeOpenApi.detail })
  get(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string): Promise<StocktakeDetail> {
    return this.stocktake.get(id, this.context(principal, 'x'));
  }

  @Get(':id/history')
  @RequirePermission('stocktake.read')
  @ApiOperation({ summary: 'Get stocktake lifecycle audit events' })
  @ApiParam({ name: 'id', type: String })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiOkResponse({ schema: stocktakeOpenApi.history })
  history(@Param('id') id: string, @Query() query: StocktakeHistoryQueryDto): Promise<StocktakeAuditResponse> {
    return this.stocktake.history(id, query);
  }

  @Post()
  @RequirePermission('stocktake.manage')
  @ApiOperation({ summary: 'Create a draft stocktake with a pinned count scope' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.create })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  create(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Body() input: StocktakeCreateDto): Promise<StocktakeDetail> {
    return this.stocktake.create(input, this.context(principal, key));
  }

  @Post(':id/start')
  @RequirePermission('stocktake.count')
  @ApiOperation({ summary: 'Open the count sheet from live balances' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.action })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  start(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: StocktakeActionDto): Promise<StocktakeDetail> {
    return this.stocktake.start(id, input, this.context(principal, key));
  }

  @Post(':id/counts')
  @RequirePermission('stocktake.count')
  @ApiOperation({ summary: 'Record physical counts against the open count sheet' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.count })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  count(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: StocktakeCountDto): Promise<StocktakeDetail> {
    return this.stocktake.count(id, input, this.context(principal, key));
  }

  @Post(':id/submit')
  @RequirePermission('stocktake.count')
  @ApiOperation({ summary: 'Submit the count sheet for review' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.action })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  submit(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: StocktakeActionDto): Promise<StocktakeDetail> {
    return this.stocktake.submit(id, input, this.context(principal, key));
  }

  @Post(':id/approve')
  @RequirePermission('stocktake.approve')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Approve the count and post one movement per changed line' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.action })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  approve(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: StocktakeActionDto): Promise<StocktakeDetail> {
    return this.stocktake.approve(id, input, this.context(principal, key));
  }

  @Post(':id/cancel')
  @RequirePermission('stocktake.manage')
  @ApiOperation({ summary: 'Cancel a stocktake before approval' })
  @ApiParam({ name: 'id', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: stocktakeOpenApi.action })
  @ApiCreatedResponse({ schema: stocktakeOpenApi.detail })
  cancel(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string,
    @Param('id') id: string, @Body() input: StocktakeActionDto): Promise<StocktakeDetail> {
    return this.stocktake.cancel(id, input, this.context(principal, key));
  }
}
