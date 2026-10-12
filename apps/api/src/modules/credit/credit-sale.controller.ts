import { Body, Controller, ForbiddenException, Headers, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiHeader, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { CreditCommandResult } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { CreditSaleApprovalDto } from './credit.dto';
import { creditOpenApi } from './credit.openapi';
import { CreditSaleService } from './credit-sale.service';

@ApiTags('credit') @ApiBearerAuth('access-token')
@Controller({ path: 'credit/admin/customers', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class CreditSaleController {
  constructor(private readonly sales: CreditSaleService) {}
  @Post(':customerId/orders/:orderId/approve')
  @RequirePermission('credit.approve') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Approve a server-priced staff credit sale; atomically post debt and consume reserved stock without recording payment' })
  @ApiParam({ name: 'customerId', type: String }) @ApiParam({ name: 'orderId', type: String })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: creditOpenApi.approval }) @ApiCreatedResponse({ schema: creditOpenApi.result })
  approve(@Param('customerId') customerId: string, @Param('orderId') orderId: string,
    @Body() input: CreditSaleApprovalDto, @Headers('idempotency-key') idempotencyKey: string,
    @CurrentPrincipal() principal: AuthPrincipalContext): Promise<CreditCommandResult> {
    if (!principal.permissions.has('orders.manage')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Order-management permission is required for credit approval.' });
    return this.sales.approve(customerId, orderId, input, { actorId: principal.userId, requestId: getRequestId(), idempotencyKey });
  }
}
