import { Body, Controller, Delete, ForbiddenException, Get, Header, Headers, HttpCode, Inject, Param, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { AdminPaymentRefundDto } from '../payments/admin-payment-refund.dto';
import { openApiAdminRefund } from '../payments/admin-payment-refund.openapi';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { ReturnCreateDto, ReturnHolidayCreateDto, ReturnListQueryDto, ReturnsSettingsDto } from './returns.dto';
import { openApiReturns } from './returns.openapi';
import { ReturnsService } from './returns.service';

const pipe = <T>(expectedType: new () => T) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });
const createPipe = pipe(ReturnCreateDto);
const queryPipe = pipe(ReturnListQueryDto);
const holidayPipe = pipe(ReturnHolidayCreateDto);
const settingsPipe = pipe(ReturnsSettingsDto);
const refundPipe = pipe(AdminPaymentRefundDto);

const idempotencyHeader = { name: 'Idempotency-Key', required: true, description: 'Opaque retry key, maximum 128 characters.' } as const;

@ApiTags('returns')
@ApiBearerAuth('access-token')
@Controller({ path: 'returns/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class ReturnsController {
  constructor(@Inject(ReturnsService) private readonly returns: ReturnsService) {}

  // Static segments are declared before `:id` so `holidays` is never read as an id.

  @Get('settings')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Whether recording new returns is switched on (off by default)' })
  @ApiResponse({ status: 200, schema: openApiReturns.settingsResult })
  readSettings() {
    return this.returns.readSettings();
  }

  @Put('settings')
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Switch recording of NEW returns on or off; refunds of recorded returns stay possible' })
  @ApiBody({ schema: openApiReturns.settingsBody })
  @ApiResponse({ status: 200, schema: openApiReturns.settingsResult })
  @ApiResponse({ status: 400, schema: openApiReturns.error })
  @ApiResponse({ status: 409, schema: openApiReturns.error })
  updateSettings(@CurrentPrincipal() principal: AuthPrincipalContext, @Body(settingsPipe) body: ReturnsSettingsDto) {
    return this.returns.updateSettings(principal.userId, getRequestId(), body);
  }

  @Get('holidays')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'List official holidays that extend the in-person return window' })
  @ApiResponse({ status: 200, schema: openApiReturns.holidayList })
  listHolidays() {
    return this.returns.listHolidays();
  }

  @Post('holidays')
  @HttpCode(201)
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Add an official holiday (Tehran calendar date)' })
  @ApiBody({ schema: openApiReturns.holidayBody })
  @ApiResponse({ status: 201, schema: { type: 'object', required: ['data'], properties: { data: openApiReturns.holiday } } })
  @ApiResponse({ status: 400, schema: openApiReturns.error })
  @ApiResponse({ status: 409, schema: openApiReturns.error })
  addHoliday(@CurrentPrincipal() principal: AuthPrincipalContext, @Body(holidayPipe) body: ReturnHolidayCreateDto) {
    return this.returns.addHoliday(body, principal.userId, getRequestId());
  }

  @Delete('holidays/:id')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Remove an official holiday; only returns recorded afterwards are affected' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: openApiReturns.holidayDeleted })
  @ApiResponse({ status: 404, schema: openApiReturns.error })
  removeHoliday(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string) {
    return this.returns.removeHoliday(id, principal.userId, getRequestId());
  }

  @Get('orders/:orderId/eligibility')
  @RequirePermission('returns.read')
  @ApiOperation({ summary: 'Return window, eligibility and returnable quantities of a paid order' })
  @ApiParam({ name: 'orderId', type: String })
  @ApiResponse({ status: 200, schema: openApiReturns.eligibility })
  @ApiResponse({ status: 404, schema: openApiReturns.error })
  eligibility(@Param('orderId') orderId: string) {
    return this.returns.eligibility(orderId);
  }

  @Post('orders/:orderId')
  @HttpCode(201)
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('returns.manage')
  @ApiOperation({ summary: 'Record goods returned against a paid order (within its window); moves no money' })
  @ApiHeader(idempotencyHeader)
  @ApiParam({ name: 'orderId', type: String })
  @ApiBody({ schema: openApiReturns.createBody })
  @ApiResponse({ status: 201, schema: openApiReturns.returnResult })
  @ApiResponse({ status: 400, schema: openApiReturns.error })
  @ApiResponse({ status: 403, schema: openApiReturns.error })
  @ApiResponse({ status: 404, schema: openApiReturns.error })
  @ApiResponse({ status: 409, schema: openApiReturns.error })
  create(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(createPipe) body: ReturnCreateDto,
  ) {
    return this.returns.create(orderId, body, { actorId: principal.userId, requestId: getRequestId(), idempotencyKey: normalizeIdempotencyKey(key) });
  }

  @Get()
  @RequirePermission('returns.read')
  @ApiOperation({ summary: 'List recorded returns' })
  @ApiResponse({ status: 200, schema: openApiReturns.listResult })
  list(@Query(queryPipe) query: ReturnListQueryDto) {
    return this.returns.list(query);
  }

  @Get(':id')
  @RequirePermission('returns.read')
  @ApiOperation({ summary: 'One recorded return with its lines and refund progress' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: openApiReturns.returnResult })
  @ApiResponse({ status: 404, schema: openApiReturns.error })
  get(@Param('id') id: string) {
    return this.returns.get(id);
  }

  @Post(':id/refund')
  @HttpCode(200)
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('payments.refund')
  @ApiOperation({ summary: 'Record the manual gateway refund that settles a return (no gateway call is made)' })
  @ApiHeader(idempotencyHeader)
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ schema: openApiAdminRefund.requestBody as never })
  @ApiResponse({ status: 200, schema: openApiReturns.refundResult })
  @ApiResponse({ status: 403, schema: openApiReturns.error })
  @ApiResponse({ status: 404, schema: openApiReturns.error })
  @ApiResponse({ status: 409, schema: openApiReturns.error })
  @ApiResponse({ status: 422, schema: openApiReturns.error })
  refund(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(refundPipe) body: AdminPaymentRefundDto,
  ) {
    // The route guard checks payments.refund (money); settling a return also needs the return permission.
    if (!principal.permissions.has('returns.manage')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'The current principal lacks the required permission.' });
    }
    return this.returns.recordRefund(id, null, body, { actorId: principal.userId, requestId: getRequestId(), idempotencyKey: normalizeIdempotencyKey(key) });
  }
}

/** Anonymous, read-only: the storefront shows the return window only while returns are switched on. */
@ApiTags('returns')
@Controller({ path: 'returns/public', version: '1' })
export class ReturnsPublicController {
  constructor(@Inject(ReturnsService) private readonly returns: ReturnsService) {}

  @Get('config')
  @Header('Cache-Control', 'public, max-age=15, stale-while-revalidate=30')
  @ApiOperation({ summary: 'Whether the store accepts returns (the return policy applies only while this is true)' })
  @ApiResponse({ status: 200, schema: openApiReturns.publicConfig })
  config() {
    return this.returns.readPublicConfig();
  }
}
