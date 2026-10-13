import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CreditCommandResult, CreditSaleReturns } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CreditCancelDto, CreditReturnDto, CreditRefundPayoutDto } from './credit.dto';
import { creditOpenApi } from './credit.openapi';
import { CreditReturnService } from './credit-return.service';

@ApiTags('credit') @ApiBearerAuth('access-token')
@Controller({ path: 'credit/admin/customers/:customerId/orders/:orderId', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class CreditReturnController {
  constructor(private readonly returns: CreditReturnService) {}
  @Get('returns') @RequirePermission('credit.read') @ApiOkResponse({ schema: creditOpenApi.returns })
  list(@Param('customerId') customerId: string, @Param('orderId') orderId: string, @Query() query: Record<string, unknown>): Promise<CreditSaleReturns> { rejectQuery(query); return this.returns.list(customerId, orderId); }

  @Post('cancel') @RequirePermission('credit.adjust') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: creditOpenApi.cancel }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  @ApiOperation({ summary: 'Cancel a pre-dispatch credit sale with atomic stock/debt compensation; no fake payout' })
  cancel(@Param('customerId') customerId: string, @Param('orderId') orderId: string, @Body() input: CreditCancelDto, @Headers('idempotency-key') key: string, @CurrentPrincipal() principal: AuthPrincipalContext): Promise<CreditCommandResult> {
    this.require(principal, ['orders.manage', 'inventory.adjust']);
    return this.returns.cancel(customerId, orderId, input, this.context(principal, key));
  }
  @Post('returns') @RequirePermission('credit.adjust') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: creditOpenApi.returnInput }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  @ApiOperation({ summary: 'Record physically received sellable goods against original sale lines; refunds remain liabilities' })
  receive(@Param('customerId') customerId: string, @Param('orderId') orderId: string, @Body() input: CreditReturnDto, @Headers('idempotency-key') key: string, @CurrentPrincipal() principal: AuthPrincipalContext): Promise<CreditCommandResult> {
    this.require(principal, ['orders.manage', 'inventory.adjust']);
    return this.returns.receive(customerId, orderId, input, this.context(principal, key));
  }
  @Post('returns/:returnId/payouts') @RequirePermission('credit.adjust') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: creditOpenApi.payout }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  @ApiOperation({ summary: 'Record an actual evidenced manual refund payout without a gateway Payment' })
  payout(@Param('customerId') customerId: string, @Param('orderId') orderId: string, @Param('returnId') returnId: string, @Body() input: CreditRefundPayoutDto, @Headers('idempotency-key') key: string, @CurrentPrincipal() principal: AuthPrincipalContext): Promise<CreditCommandResult> {
    this.require(principal, ['credit.receive']);
    return this.returns.payout(customerId, orderId, returnId, input, this.context(principal, key));
  }
  private require(principal: AuthPrincipalContext, permissions: string[]) {
    if (permissions.some(permission => !principal.permissions.has(permission))) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Current stock/order or refund-recording permissions are required.' });
  }
  private context(principal: AuthPrincipalContext, idempotencyKey: string) { return { actorId: principal.userId, requestId: getRequestId(), idempotencyKey }; }
}

@ApiTags('credit') @ApiBearerAuth('access-token')
@Controller({ path: 'customers/me/credit/orders', version: '1' }) @RequireAuthentication('CUSTOMER_OTP')
export class CustomerCreditReturnController {
  constructor(private readonly returns: CreditReturnService) {}
  @Get(':orderId/returns') @ApiOkResponse({ schema: { type: 'object', required: ['data'], properties: { data: creditOpenApi.returns } } })
  list(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('orderId') orderId: string, @Query() query: Record<string, unknown>): Promise<{ data: CreditSaleReturns }> { rejectQuery(query); return this.returns.customerList(principal.userId, orderId).then(data => ({ data })); }
}

function rejectQuery(query: Record<string, unknown>) { if (Object.keys(query).length) throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'This bounded resource read accepts no ownership or query override.' }); }
