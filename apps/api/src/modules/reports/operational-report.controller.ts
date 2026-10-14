import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Inject,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { failureError } from '../orders/order-openapi-schemas';
import { OperationalReportService } from './operational-report.service';
import {
  debtorRange,
  reportRange,
  reportOptions,
} from './operational-report.validation';
import { operationalOpenApi } from './operational-report.openapi';
const rangeQueries =
  () => (target: object, property: string, descriptor: PropertyDescriptor) => {
    for (const name of [
      'from',
      'toExclusive',
      'customerId',
      'productId',
      'status',
    ])
      ApiQuery({
        name,
        required: ['from', 'toExclusive'].includes(name),
        type: String,
        ...(['from', 'toExclusive'].includes(name)
          ? { format: 'date-time' }
          : {}),
      })(target, property, descriptor);
  };
@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports/admin/operations', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('reports.read')
@ApiResponse({ status: 400, schema: failureError(['INVALID_REQUEST'], 400) })
@ApiResponse({
  status: 401,
  schema: failureError(['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'], 401),
})
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) })
@ApiResponse({ status: 500, schema: failureError(['REPORT_UNAVAILABLE'], 500) })
export class OperationalReportController {
  constructor(
    @Inject(OperationalReportService)
    private readonly service: OperationalReportService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: operationalOpenApi.summary })
  @rangeQueries()
  @ApiQuery({ name: 'grain', required: false, enum: ['day', 'week', 'month'] })
  @ApiOperation({
    summary:
      'Read operational evidence; order value, settlements, refunds, credit and invoices remain separate',
  })
  async summary(@Query() query: Record<string, unknown>) {
    reportRange(query);
    return { data: { report: await this.service.summary(query) } };
  }
  @Get('options')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: operationalOpenApi.options })
  @ApiQuery({ name: 'kind', required: true, enum: ['customer', 'product'] })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 64 })
  async options(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = reportOptions(query);
    if (
      !principal.permissions.has(
        parsed.kind === 'customer' ? 'customers.read' : 'catalog.read',
      )
    )
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message:
          'Current source read permission is required for report selection.',
      });
    return { data: await this.service.options(parsed.kind, parsed.search) };
  }
  @Get('orders')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: operationalOpenApi.orders })
  @rangeQueries()
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    minimum: 0,
    maximum: 1000000,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  async orders(@Query() query: Record<string, unknown>) {
    reportRange(query, true);
    return { data: await this.service.orders(query) };
  }
  @Get('debtors')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: operationalOpenApi.debtors })
  @ApiQuery({ name: 'asOf', required: true, type: String, format: 'date-time' })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    minimum: 0,
    maximum: 1000000,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @ApiOperation({
    summary:
      'Read evidenced debtor aging; additionally requires current credit.read',
  })
  async debtors(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Query() query: Record<string, unknown>,
  ) {
    if (!principal.permissions.has('credit.read'))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Current credit read permission is required.',
      });
    debtorRange(query);
    return { data: await this.service.debtors(query) };
  }
}
