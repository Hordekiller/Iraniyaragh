import { Body, Controller, Get, Header, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';
import { INVOICE_PDF_CAPACITY_LIMITS as LIMITS, type InvoicePdfCapacityResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { InvoicePdfCapacityService } from './invoice-pdf-capacity.service';

class InvoicePdfCapacityDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsBoolean() enabled!: boolean;
  @IsInt() @Min(LIMITS.budgetMegabytes.min) @Max(LIMITS.budgetMegabytes.max) budgetMegabytes!: number;
  @IsInt() @Min(LIMITS.maxArtifacts.min) @Max(LIMITS.maxArtifacts.max) maxArtifacts!: number;
  @IsInt() @Min(LIMITS.maxPendingJobs.min) @Max(LIMITS.maxPendingJobs.max) maxPendingJobs!: number;
}

@Controller({ path: 'settings/admin/invoice-pdf-capacity', version: '1' })
@ApiBearerAuth('access-token')
@RequireAuthentication('STAFF_MFA')
@RequirePermission('settings.manage')
export class InvoicePdfCapacityController {
  constructor(@Inject(InvoicePdfCapacityService) private readonly service: InvoicePdfCapacityService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read the operator-approved invoice PDF storage capacity and its current usage' })
  async read(): Promise<InvoicePdfCapacityResponse> { return { data: { capacity: await this.service.read() } }; }

  @Put()
  @Header('Cache-Control', 'no-store')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Approve, resize or switch off the invoice PDF storage capacity; never lowers it below what is stored' })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: InvoicePdfCapacityDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: InvoicePdfCapacityDto): Promise<InvoicePdfCapacityResponse> {
    return { data: { capacity: await this.service.update(principal.userId, getRequestId(), input) } };
  }
}
