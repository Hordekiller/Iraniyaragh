import { Controller, HttpCode, Inject, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { AdminPaymentReconciliationResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { AdminPaymentReconciliationService } from './admin-payment-reconciliation.service';
import { openApiAdminPaymentReconciliation } from './admin-payment-reconciliation.openapi';

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller({ path: 'payments/admin', version: '1' })
export class AdminPaymentReconciliationController {
  constructor(
    @Inject(AdminPaymentReconciliationService)
    private readonly reconciliation: AdminPaymentReconciliationService,
  ) {}

  @Post(':id/reconcile')
  @HttpCode(200)
  @RequireFreshAuthentication('STAFF_MFA')
  @RequirePermission('payments.reconcile')
  @ApiOperation({ summary: 'Manually re-query an unconfirmed pending payment at the gateway' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: openApiAdminPaymentReconciliation.response })
  @ApiResponse({ status: 401, schema: openApiAdminPaymentReconciliation.failure })
  @ApiResponse({ status: 403, schema: openApiAdminPaymentReconciliation.failure })
  @ApiResponse({ status: 404, schema: openApiAdminPaymentReconciliation.failure })
  @ApiResponse({ status: 409, schema: openApiAdminPaymentReconciliation.failure })
  @ApiResponse({ status: 503, schema: openApiAdminPaymentReconciliation.failure })
  recheck(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') paymentId: string,
  ): Promise<AdminPaymentReconciliationResponse> {
    return this.reconciliation.recheck({ paymentId, actorId: principal.userId, requestId: getRequestId() });
  }
}
