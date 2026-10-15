import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Put,
  Query,
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
}
