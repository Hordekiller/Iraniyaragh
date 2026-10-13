import { Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post, Query, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiCreatedResponse, ApiTags, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { getRequestId } from '../../common/request-context';
import { invoiceInvalid } from './invoice-policy.validation';
import { InvoiceDocumentService } from './invoice-document.service';
import { invoiceDocumentOpenApi } from './invoice-document.openapi';
import { failureError } from '../orders/order-openapi-schemas';
export class InvoiceIssueDto {
  @ApiProperty({ minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
  @ApiProperty({ minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedOrderVersion!: number;
}
function pagination(query: Record<string, unknown>) {
  if (Object.keys(query).some(key => !['offset','limit'].includes(key))) throw invoiceInvalid('Only bounded pagination is accepted.');
  const number = (value: unknown, fallback: number) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,6})$/u.test(value)) throw invoiceInvalid('Bounded pagination is required.');
    return Number(value);
  };
  return { offset: number(query.offset, 0), limit: number(query.limit, 25) };
}
@ApiTags('invoice-documents') @ApiBearerAuth('access-token')
@Controller({ path: 'invoices/admin', version: '1' })
@RequireAuthentication('STAFF_MFA') @RequirePermission('invoices.read')
@ApiResponse({ status: 400, schema: failureError(['INVALID_REQUEST','VALIDATION_ERROR'], 400) })
@ApiResponse({ status: 401, schema: failureError(['AUTH_SESSION_INVALID','AUTH_SESSION_REPLAYED'], 401) })
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN','AUTH_REAUTHENTICATION_REQUIRED'], 403) })
@ApiResponse({ status: 404, schema: failureError(['INVOICE_DOCUMENT_NOT_FOUND','INVOICE_DRAFT_NOT_FOUND'], 404) })
@ApiResponse({ status: 409, schema: failureError(['STALE_VERSION','IDEMPOTENCY_CONFLICT','INVOICE_ISSUE_CONFLICT','INVOICE_SOURCE_CHANGED','INVOICE_REQUOTE_REQUIRED','INVOICE_POLICY_REQUIRED','CONFLICT'], 409) })
@ApiResponse({ status: 500, schema: failureError(['INVOICE_ISSUE_UNAVAILABLE'], 500) })
export class InvoiceDocumentController {
  constructor(@Inject(InvoiceDocumentService) private readonly service: InvoiceDocumentService) {}
  @Get('documents') @Header('Cache-Control','no-store') @ApiOkResponse({ schema: invoiceDocumentOpenApi.list })
  async list(@Query() query: Record<string, unknown>) { const page = pagination(query); return { data: await this.service.list(page.offset, page.limit) }; }
  @Get('documents/:id') @Header('Cache-Control','no-store') @ApiOkResponse({ schema: invoiceDocumentOpenApi.read })
  async read(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    return { data: { document: await this.service.read(id) } };
  }
  @Post('drafts/:id/issue') @Header('Cache-Control','no-store') @RequirePermission('invoices.issue') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ type: InvoiceIssueDto }) @ApiCreatedResponse({ schema: invoiceDocumentOpenApi.issue })
  async issue(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string,
    @Body(new ValidationPipe({ expectedType: InvoiceIssueDto, transform: true, whitelist: true, forbidNonWhitelisted: true })) input: InvoiceIssueDto) {
    if (!principal.permissions.has('invoices.read')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Current invoice read permission is required.' });
    return { data: await this.service.issue(principal.userId, getRequestId(), id, input, key) };
  }
}
