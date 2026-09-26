import { Body, Controller, Get, Headers, HttpCode, Inject, Param, Post, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { RecordFulfillmentPickDto } from './fulfillment-pick.dto';
import { openApiFulfillmentPick } from './fulfillment-pick.openapi';
import { FulfillmentPickService } from './fulfillment-pick.service';

const bodyPipe = new ValidationPipe({ expectedType: RecordFulfillmentPickDto, whitelist: true, forbidNonWhitelisted: true, transform: true });

@ApiTags('fulfillment')
@ApiBearerAuth('access-token')
@Controller({ path: 'orders/admin/:id/fulfillment', version: '1' })
export class FulfillmentPickController {
  constructor(@Inject(FulfillmentPickService) private readonly picks: FulfillmentPickService) {}

  @Get('picks')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('orders.read')
  @ApiOperation({ summary: 'List exact item-level fulfillment pick proof for staff' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: openApiFulfillmentPick.list })
  @ApiResponse({ status: 401, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 403, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 404, schema: openApiFulfillmentPick.error })
  list(@Param('id') id: string) { return this.picks.list(id); }

  @Post('items/:itemId/pick')
  @HttpCode(200)
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('orders.manage')
  @ApiOperation({ summary: 'Record exact-quantity physical pick proof for one order item' })
  @ApiParam({ name: 'id', type: String })
  @ApiParam({ name: 'itemId', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: openApiFulfillmentPick.body })
  @ApiResponse({ status: 200, schema: openApiFulfillmentPick.result })
  @ApiResponse({ status: 400, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 401, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 403, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 404, schema: openApiFulfillmentPick.error })
  @ApiResponse({ status: 409, schema: openApiFulfillmentPick.error })
  record(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body(bodyPipe) body: RecordFulfillmentPickDto,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.picks.record(id, itemId, body.quantity, {
      actorId: principal.userId,
      requestId: getRequestId(),
      idempotencyKey: normalizeIdempotencyKey(key),
    });
  }
}
