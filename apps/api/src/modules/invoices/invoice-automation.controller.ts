import { Body, Controller, ForbiddenException, Get, Header, Inject, Put, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min } from 'class-validator';
import type { InvoiceAutomationResponse } from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { INVOICE_AUTOMATION_PERMISSIONS, InvoiceAutomationService } from './invoice-automation.service';

class InvoiceAutomationDto {
  @IsInt() @Min(0) expectedVersion!: number;
  @IsBoolean() enabled!: boolean;
}

@Controller({ path: 'settings/admin/invoice-automation', version: '1' })
@ApiBearerAuth('access-token')
@RequireAuthentication('STAFF_MFA')
@RequirePermission('settings.manage')
export class InvoiceAutomationController {
  constructor(@Inject(InvoiceAutomationService) private readonly service: InvoiceAutomationService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Read whether paid orders are invoiced and published automatically, and how many are waiting' })
  async read(): Promise<InvoiceAutomationResponse> { return { data: { config: await this.service.readAdmin() } }; }

  @Put()
  @Header('Cache-Control', 'no-store')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Switch automatic invoice issuance and publication for paid orders on or off; the enabling operator is the standing authority' })
  async update(@CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: InvoiceAutomationDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: InvoiceAutomationDto): Promise<InvoiceAutomationResponse> {
    // Enabling delegates this operator's own authority, so they must hold every permission the automation exercises.
    if (input.enabled && !INVOICE_AUTOMATION_PERMISSIONS.every(permission => principal.permissions.has(permission))) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Issuing and publishing invoices must be permitted to enable automatic invoicing.' });
    }
    return { data: { config: await this.service.update(principal.userId, getRequestId(), input) } };
  }
}
