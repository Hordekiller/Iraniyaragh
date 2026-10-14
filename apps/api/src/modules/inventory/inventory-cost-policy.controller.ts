import { Body, Controller, Get, Header, Headers, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { InventoryCostPolicyResponse } from '@iranyaragh/contracts';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { InventoryCostPolicyService } from './inventory-cost-policy.service';
import { InventoryCostPolicyDto } from './inventory-cost-policy.validation';
import { costPolicySchemas } from './inventory-cost-policy.openapi';

@ApiTags('inventory-cost-policy') @ApiBearerAuth('access-token')
@Controller({ path: 'settings/admin/inventory-cost-policy', version: '1' })
@RequireAuthentication('STAFF_MFA') @RequirePermission('settings.manage')
@ApiResponse({ status: 401, schema: costPolicySchemas.unauthorized }) @ApiResponse({ status: 403, schema: costPolicySchemas.forbidden })
@ApiResponse({ status: 500, schema: costPolicySchemas.unavailable })
export class InventoryCostPolicyController {
  constructor(@Inject(InventoryCostPolicyService) private readonly policy: InventoryCostPolicyService) {}
  @Get() @Header('Cache-Control', 'no-store') @ApiOperation({ summary: 'Read selected inventory cost method; valuation remains disabled pending cost ledger acceptance' })
  @ApiOkResponse({ schema: costPolicySchemas.response })
  async read(): Promise<InventoryCostPolicyResponse> { return { data: await this.policy.read() }; }

  @Put() @Header('Cache-Control', 'no-store') @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Append a cost-method configuration; cannot activate valuation or change stock/financial evidence' })
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ schema: costPolicySchemas.body })
  @ApiOkResponse({ schema: costPolicySchemas.response }) @ApiResponse({ status: 400, schema: costPolicySchemas.invalid })
  @ApiResponse({ status: 409, schema: costPolicySchemas.conflict })
  async revise(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: InventoryCostPolicyDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: InventoryCostPolicyDto): Promise<InventoryCostPolicyResponse> {
    return { data: await this.policy.revise(principal.userId, getRequestId(), input, normalizeIdempotencyKey(key)) };
  }
}
