import { Body, Controller, ForbiddenException, Get, Headers, Inject, Param, Post, Put, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { CurrentPrincipal, RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { InvoiceDraftResponses } from './invoice-draft.openapi';
import { InvoiceDraftService } from './invoice-draft.service';
import { InvoiceDraftCancelDto, InvoiceDraftCreateDto, InvoiceDraftEditDto, InvoiceDraftFromOrderDto, InvoiceDraftVersionDto } from './invoice-draft.dto';
import { invoiceInvalid } from './invoice-policy.validation';
const body = (expectedType: new () => object) => new ValidationPipe({ expectedType, whitelist: true, forbidNonWhitelisted: true, transform: true });
function integer(value: string | undefined, fallback: number) { if (value === undefined) return fallback; if (!/^(0|[1-9][0-9]{0,6})$/u.test(value)) throw invoiceInvalid('Bounded pagination is required.'); return Number(value); }

@ApiTags('invoice-drafts')
@ApiBearerAuth('access-token')
@Controller({ path: 'invoices/admin/drafts', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('invoices.read')
export class InvoiceDraftController {
  constructor(@Inject(InvoiceDraftService) private readonly service: InvoiceDraftService) {}
  private readPermission(principal: AuthPrincipalContext) {
    if (!principal.permissions.has('invoices.read')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Current invoice read permission is required.' });
  }
  @Get()
  @InvoiceDraftResponses('list')
  @ApiOperation({ summary: 'Bounded staff-only independent invoice drafts; no financial effects' })
  async list(@Query('offset') offset?: string, @Query('limit') limit?: string) { return { data: await this.service.list(integer(offset, 0), integer(limit, 25)) }; }
  @Get('options')
  @InvoiceDraftResponses('options')
  @RequirePermission('invoices.manage')
  @ApiOperation({ summary: 'Real active catalog/customer options and approved shipping tariffs' })
  async options(@CurrentPrincipal() principal: AuthPrincipalContext, @Query('kind') kind: string, @Query('search') search?: string, @Query('offset') offset?: string, @Query('limit') limit?: string) {
    this.readPermission(principal);
    if (!['customer', 'variant', 'shipping'].includes(kind)) throw invoiceInvalid('A valid option kind is required.');
    return this.service.options(kind as 'customer' | 'variant' | 'shipping', search, integer(offset, 0), integer(limit, 25));
  }
  @Get(':id')
  @InvoiceDraftResponses('read')
  async read(@Param('id') id: string) { return { data: { draft: await this.service.read(id) } }; }
  @Get(':id/history')
  @InvoiceDraftResponses('history')
  async history(@Param('id') id: string, @Query('offset') offset?: string, @Query('limit') limit?: string) { return { data: await this.service.history(id, integer(offset, 0), integer(limit, 25)) }; }
  @Post()
  @InvoiceDraftResponses('command', true)
  @RequirePermission('invoices.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async create(@CurrentPrincipal() principal: AuthPrincipalContext, @Headers('idempotency-key') key: string, @Body(body(InvoiceDraftCreateDto)) input: InvoiceDraftCreateDto) {
    this.readPermission(principal); return { data: await this.service.create(principal.userId, getRequestId(), input, normalizeIdempotencyKey(key)) };
  }
  @Post('from-order/:orderId')
  @InvoiceDraftResponses('command', true)
  @RequirePermission('invoices.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async fromOrder(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('orderId') orderId: string, @Headers('idempotency-key') key: string, @Body(body(InvoiceDraftFromOrderDto)) input: InvoiceDraftFromOrderDto) {
    this.readPermission(principal); return { data: await this.service.fromOrder(principal.userId, getRequestId(), orderId, input, normalizeIdempotencyKey(key)) };
  }
  @Put(':id')
  @InvoiceDraftResponses('command')
  @RequirePermission('invoices.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async edit(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body(body(InvoiceDraftEditDto)) input: InvoiceDraftEditDto) {
    this.readPermission(principal); return { data: await this.service.edit(principal.userId, getRequestId(), id, input, normalizeIdempotencyKey(key)) };
  }
  @Post(':id/requote')
  @InvoiceDraftResponses('command', true)
  @RequirePermission('invoices.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async requote(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body(body(InvoiceDraftVersionDto)) input: InvoiceDraftVersionDto) {
    this.readPermission(principal); return { data: await this.service.requote(principal.userId, getRequestId(), id, input.expectedVersion, normalizeIdempotencyKey(key)) };
  }
  @Post(':id/cancel')
  @InvoiceDraftResponses('command', true)
  @RequirePermission('invoices.manage')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  async cancel(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string, @Body(body(InvoiceDraftCancelDto)) input: InvoiceDraftCancelDto) {
    this.readPermission(principal); return { data: await this.service.cancel(principal.userId, getRequestId(), id, input.expectedVersion, input.reason, normalizeIdempotencyKey(key)) };
  }
}
