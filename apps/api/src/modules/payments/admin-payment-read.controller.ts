import { Controller, Get, Inject, Param, Query, ValidationPipe } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminPaymentDetailResponse, AdminPaymentListResponse } from '@iranyaragh/contracts';
import { RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import { AdminPaymentListQueryDto, PAYMENT_STATUS_VALUES } from './admin-payment-read.dto';
import { AdminPaymentReadService } from './admin-payment-read.service';
import { openApiAdminPayments } from './admin-payment-read.openapi';

const queryPipe = new ValidationPipe({
  expectedType: AdminPaymentListQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('payments')
@ApiBearerAuth('access-token')
@Controller({ path: 'payments/admin', version: '1' })
export class AdminPaymentReadController {
  constructor(@Inject(AdminPaymentReadService) private readonly payments: AdminPaymentReadService) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'List staff-safe payment evidence' })
  @ApiQuery({ name: 'page', required: false, type: Number, minimum: 1, maximum: 10_000 })
  @ApiQuery({ name: 'perPage', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'status', required: false, enum: PAYMENT_STATUS_VALUES })
  @ApiQuery({ name: 'search', required: false, type: String, maxLength: 120, description: 'Order-number search only.' })
  @ApiResponse({ status: 200, schema: openApiAdminPayments.list })
  @ApiResponse({ status: 400, schema: openApiAdminPayments.failure })
  @ApiResponse({ status: 401, schema: openApiAdminPayments.failure })
  @ApiResponse({ status: 403, schema: openApiAdminPayments.failure })
  list(@Query(queryPipe) query: AdminPaymentListQueryDto): Promise<AdminPaymentListResponse> {
    return this.payments.list(query);
  }

  @Get(':id')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('payments.read')
  @ApiOperation({ summary: 'Read staff-safe payment detail and state history' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, schema: openApiAdminPayments.detail })
  @ApiResponse({ status: 401, schema: openApiAdminPayments.failure })
  @ApiResponse({ status: 403, schema: openApiAdminPayments.failure })
  @ApiResponse({ status: 404, schema: openApiAdminPayments.failure })
  get(@Param('id') id: string): Promise<AdminPaymentDetailResponse> {
    return this.payments.get(id);
  }
}
