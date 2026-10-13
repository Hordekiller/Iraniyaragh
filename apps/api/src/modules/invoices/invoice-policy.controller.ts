import { Body, Controller, Get, Headers, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { InvoicePolicyResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { InvoicePolicyService } from './invoice-policy.service';
import { InvoicePolicyDto } from './invoice-policy.dto';
import { invoicePolicySchemas as schema } from './invoice-policy.openapi';

@ApiTags('invoice-policy')
@ApiBearerAuth('access-token')
@Controller({ path: 'settings/admin/invoice-policy', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('settings.manage')
@ApiResponse({ status: 401, schema: schema.unauthorized })
@ApiResponse({ status: 403, schema: schema.forbidden })
@ApiResponse({ status: 500, schema: schema.unavailable })
export class InvoicePolicyController {
  constructor(@Inject(InvoicePolicyService) private readonly service: InvoicePolicyService) {}
  @Get()
  @ApiOperation({ summary: 'Read the current store invoice policy or null; no default seller or tax policy' })
  @ApiOkResponse({ schema: schema.response })
  async current(): Promise<InvoicePolicyResponse> { return { data: { policy: await this.service.current() } }; }

  @Put()
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Append an approved immutable store invoice policy revision; never alters historical orders/payments' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ schema: schema.body })
  @ApiOkResponse({ schema: schema.response })
  @ApiResponse({ status: 400, schema: schema.invalid })
  @ApiResponse({ status: 409, schema: schema.conflict })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string | undefined,
    @Body(new ValidationPipe({ expectedType: InvoicePolicyDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: InvoicePolicyDto): Promise<InvoicePolicyResponse> {
    return { data: { policy: await this.service.update(principal.userId, getRequestId(), input, normalizeIdempotencyKey(key)) } };
  }
}
