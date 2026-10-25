import { Body, Controller, ForbiddenException, Get, Header, Headers, Inject, Param, Post, Query, Res, ValidationPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOkResponse, ApiCreatedResponse, ApiTags, ApiProperty, ApiResponse } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';
import { Response } from 'express';
import { CurrentPrincipal, RequireAuthentication, RequireFreshAuthentication, RequirePermission } from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { getRequestId } from '../../common/request-context';
import { invoiceInvalid } from './invoice-policy.validation';
import { InvoiceDocumentService } from './invoice-document.service';
import { InvoicePdfJobService } from './invoice-pdf-job.service';
import { invoiceDocumentOpenApi } from './invoice-document.openapi';
import { failureError } from '../orders/order-openapi-schemas';
export class InvoiceIssueDto {
  @ApiProperty({ type: Number, minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedVersion!: number;
  @ApiProperty({ type: Number, minimum: 0, maximum: 2147483646 }) @IsInt() @Min(0) @Max(2147483646) expectedOrderVersion!: number;
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
@ApiResponse({ status: 401, schema: failureError(['AUTH_SESSION_INVALID','AUTH_SESSION_REPLAYED','AUTH_REAUTHENTICATION_REQUIRED'], 401) })
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) })
@ApiResponse({ status: 404, schema: failureError(['INVOICE_DOCUMENT_NOT_FOUND','INVOICE_DRAFT_NOT_FOUND'], 404) })
@ApiResponse({ status: 409, schema: failureError(['STALE_VERSION','IDEMPOTENCY_CONFLICT','INVOICE_ISSUE_CONFLICT','INVOICE_SOURCE_CHANGED','INVOICE_REQUOTE_REQUIRED','INVOICE_POLICY_REQUIRED','CONFLICT'], 409) })
@ApiResponse({ status: 500, schema: failureError(['INVOICE_ISSUE_UNAVAILABLE'], 500) })
export class InvoiceDocumentController {
  constructor(@Inject(InvoiceDocumentService) private readonly service: InvoiceDocumentService,
    @Inject(InvoicePdfJobService) private readonly pdf: InvoicePdfJobService) {}
  @Get('documents') @Header('Cache-Control','no-store') @ApiOkResponse({ schema: invoiceDocumentOpenApi.list })
  async list(@Query() query: Record<string, unknown>) { const page = pagination(query); return { data: await this.service.list(page.offset, page.limit) }; }
  @Get('documents/:id') @Header('Cache-Control','no-store') @ApiOkResponse({ schema: invoiceDocumentOpenApi.read })
  async read(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    return { data: { document: await this.service.read(id) } };
  }
  @Get('drafts/:id/document') @Header('Cache-Control','no-store') @ApiOkResponse({ schema: invoiceDocumentOpenApi.read })
  async fromDraft(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    return { data: { document: await this.service.fromDraft(id) } };
  }
  @Post('drafts/:id/issue') @Header('Cache-Control','no-store') @RequirePermission('invoices.issue') @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true }) @ApiBody({ type: InvoiceIssueDto }) @ApiCreatedResponse({ schema: invoiceDocumentOpenApi.issue })
  async issue(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string,
    @Body(new ValidationPipe({ expectedType: InvoiceIssueDto, transform: true, whitelist: true, forbidNonWhitelisted: true })) input: InvoiceIssueDto) {
    if (!principal.permissions.has('invoices.read')) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Current invoice read permission is required.' });
    return { data: await this.service.issue(principal.userId, getRequestId(), id, input, normalizeIdempotencyKey(key)) };
  }

  /** Private raster-render request for an issued document (fresh evidence only). */
  @Post('documents/:id/pdf') @Header('Cache-Control','no-store')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ schema: invoiceDocumentOpenApi.pdfRequest })
  @ApiResponse({ status: 409, schema: failureError(['IDEMPOTENCY_CONFLICT','INVOICE_PDF_CAPACITY_EXCEEDED'], 409) })
  @ApiResponse({ status: 400, schema: failureError(['INVOICE_PDF_DISABLED','INVALID_REQUEST'], 400) })
  @ApiResponse({ status: 503, schema: failureError(['INVOICE_PDF_STORAGE_UNAVAILABLE'], 503) })
  async requestPdf(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Headers('idempotency-key') key: string,
    @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    return { data: await this.pdf.request({ scope: 'staff', actorId: principal.userId, requestId: getRequestId(), documentId: id, key: normalizeIdempotencyKey(key) }) };
  }

  /** Poll the render status of one issued document. */
  @Get('documents/:id/pdf') @Header('Cache-Control','no-store')
  @ApiOkResponse({ schema: invoiceDocumentOpenApi.pdfRequest })
  @ApiResponse({ status: 409, schema: failureError(['INVOICE_PDF_NOT_READY'], 409) })
  async pdfStatus(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('id') id: string, @Query() query: Record<string, unknown>) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    return { data: await this.pdf.status({ scope: 'staff', actorId: principal.userId, documentId: id }) };
  }

  /** Authoritative private artifact download; bytes are verified and never READY-early. */
  @Get('documents/:id/pdf/artifact') @Header('Cache-Control','no-store')
  @ApiResponse({ status: 409, schema: failureError(['INVOICE_PDF_NOT_READY'], 409) })
  async downloadPdf(@Param('id') id: string, @Query() query: Record<string, unknown>, @Res({ passthrough: false }) response: Response) {
    if (Object.keys(query).length) throw invoiceInvalid('This resource accepts no owner or query override.');
    const download = await this.pdf.downloadStaff(id);
    return this.sendPdf(response, download);
  }

  private sendPdf(response: Response, download: { bytes: Buffer; pdfSha256: string; byteCount: number; filename: string }) {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(download.byteCount));
    response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    response.setHeader('X-Content-SHA256', download.pdfSha256);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(download.bytes);
    return response;
  }
}
