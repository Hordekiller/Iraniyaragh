import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Response } from 'express';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { failureError } from '../orders/order-openapi-schemas';
import { invoiceInvalid } from './invoice-policy.validation';
import {
  invoicePage,
  InvoicePublicationService,
} from './invoice-publication.service';
import { InvoicePdfJobService } from './invoice-pdf-job.service';
import { invoicePublicationOpenApi } from './invoice-publication.openapi';
class PublicationDto {
  @ApiProperty({ type: Number, minimum: 0, maximum: 2147483646 })
  @IsInt()
  @Min(0)
  @Max(2147483646)
  expectedVersion!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() isPublished!: boolean;
  @ApiProperty({ type: String, minLength: 1, maxLength: 500 })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
@ApiTags('invoice-publication')
@ApiBearerAuth('access-token')
@Controller({ path: 'invoices/admin/documents/:id/publication', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('invoices.read')
@ApiResponse({
  status: 400,
  schema: failureError(['INVALID_REQUEST', 'VALIDATION_ERROR'], 400),
})
@ApiResponse({
  status: 401,
  schema: failureError(
    [
      'AUTH_SESSION_INVALID',
      'AUTH_SESSION_REPLAYED',
      'AUTH_REAUTHENTICATION_REQUIRED',
    ],
    401,
  ),
})
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) })
@ApiResponse({
  status: 404,
  schema: failureError(['INVOICE_DOCUMENT_NOT_FOUND'], 404),
})
@ApiResponse({
  status: 409,
  schema: failureError(
    ['INVOICE_PUBLICATION_CONFLICT', 'IDEMPOTENCY_CONFLICT', 'CONFLICT'],
    409,
  ),
})
@ApiResponse({
  status: 500,
  schema: failureError(['INVOICE_PUBLICATION_UNAVAILABLE'], 500),
})
export class InvoicePublicationController {
  constructor(
    @Inject(InvoicePublicationService)
    private readonly service: InvoicePublicationService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: invoicePublicationOpenApi.admin })
  async read(@Param('id') id: string, @Query() query: Record<string, unknown>) {
    const page = invoicePage(query);
    return { data: await this.service.read(id, page.offset, page.limit) };
  }
  @Put()
  @Header('Cache-Control', 'no-store')
  @RequirePermission('invoices.publish')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: PublicationDto })
  @ApiOkResponse({ schema: invoicePublicationOpenApi.result })
  async change(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Body(
      new ValidationPipe({
        expectedType: PublicationDto,
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: PublicationDto,
  ) {
    if (!principal.permissions.has('invoices.read'))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Current invoice read permission is required.',
      });
    return {
      data: await this.service.change(
        principal.userId,
        getRequestId(),
        id,
        input,
        normalizeIdempotencyKey(key),
      ),
    };
  }
}
@ApiTags('customer-invoices')
@ApiBearerAuth('access-token')
@Controller({ path: 'customers/me/invoices', version: '1' })
@RequireAuthentication('CUSTOMER_OTP')
@ApiResponse({
  status: 400,
  schema: failureError(['INVALID_REQUEST', 'VALIDATION_ERROR'], 400),
})
@ApiResponse({
  status: 401,
  schema: failureError(['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'], 401),
})
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) })
@ApiResponse({
  status: 404,
  schema: failureError(['INVOICE_DOCUMENT_NOT_FOUND'], 404),
})
@ApiResponse({
  status: 500,
  schema: failureError(['INVOICE_PUBLICATION_UNAVAILABLE'], 500),
})
export class CustomerInvoiceController {
  constructor(
    @Inject(InvoicePublicationService)
    private readonly service: InvoicePublicationService,
    @Inject(InvoicePdfJobService) private readonly pdf: InvoicePdfJobService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: invoicePublicationOpenApi.customerList })
  async list(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Query() query: Record<string, unknown>,
  ) {
    const page = invoicePage(query);
    return {
      data: await this.service.customerList(
        principal.userId,
        page.offset,
        page.limit,
      ),
    };
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: invoicePublicationOpenApi.customer })
  async read(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw invoiceInvalid('This resource accepts no owner or query override.');
    return {
      data: { invoice: await this.service.customerRead(principal.userId, id) },
    };
  }

  /** Private render request bounded to an ACTIVE customer's published invoice. */
  @Post(':id/pdf')
  @Header('Cache-Control', 'no-store')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ schema: invoicePublicationOpenApi.pdfRequest })
  @ApiResponse({
    status: 409,
    schema: failureError(
      ['INVOICE_PDF_NOT_READY', 'INVOICE_PDF_CAPACITY_EXCEEDED', 'IDEMPOTENCY_CONFLICT'],
      409,
    ),
  })
  @ApiResponse({ status: 400, schema: failureError(['INVOICE_PDF_DISABLED', 'INVALID_REQUEST'], 400) })
  @ApiResponse({
    status: 503,
    schema: failureError(['INVOICE_PDF_STORAGE_UNAVAILABLE'], 503),
  })
  async requestPdf(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw invoiceInvalid('This resource accepts no owner or query override.');
    return {
      data: await this.pdf.request({
        scope: 'customer',
        actorId: principal.userId,
        requestId: getRequestId(),
        documentId: id,
        key: normalizeIdempotencyKey(key),
      }),
    };
  }

  /** Render status poll for one published invoice. */
  @Get(':id/pdf')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: invoicePublicationOpenApi.pdfRequest })
  async pdfStatus(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (Object.keys(query).length)
      throw invoiceInvalid('This resource accepts no owner or query override.');
    return {
      data: await this.pdf.status({
        scope: 'customer',
        actorId: principal.userId,
        documentId: id,
      }),
    };
  }

  /** Verified private download; consistent identity re-checked at GET time. */
  @Get(':id/pdf/artifact')
  @Header('Cache-Control', 'no-store')
  async downloadPdf(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Res({ passthrough: false }) response: Response,
  ) {
    if (Object.keys(query).length)
      throw invoiceInvalid('This resource accepts no owner or query override.');
    const download = await this.pdf.downloadCustomer(principal.userId, id);
    return this.sendPdf(response, download);
  }

  private sendPdf(
    response: Response,
    download: { bytes: Buffer; pdfSha256: string; byteCount: number; filename: string },
  ) {
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', String(download.byteCount));
    response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    response.setHeader('X-Content-SHA256', download.pdfSha256);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(download.bytes);
    return response;
  }
}
