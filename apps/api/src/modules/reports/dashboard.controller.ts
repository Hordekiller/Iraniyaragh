import {
  Controller,
  Get,
  Header,
  Inject,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminDashboardResponse } from '@iranyaragh/contracts';
import { RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import { AdminDashboardQueryDto } from './dashboard.dto';
import { openApiDashboard } from './dashboard.openapi';
import { DashboardService } from './dashboard.service';

const queryPipe = new ValidationPipe({
  expectedType: AdminDashboardQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports/admin/dashboard', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('reports.read')
export class DashboardController {
  constructor(
    @Inject(DashboardService) private readonly dashboard: DashboardService,
  ) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Read a bounded, PII-free operational dashboard snapshot',
  })
  @ApiQuery({
    name: 'createdFrom',
    required: true,
    type: String,
    format: 'date-time',
    description: 'Inclusive UTC instant for range-scoped order metrics.',
  })
  @ApiQuery({
    name: 'createdToExclusive',
    required: true,
    type: String,
    format: 'date-time',
    description: 'Exclusive UTC instant; the range must not exceed 90 days.',
  })
  @ApiOkResponse({ schema: openApiDashboard.summaryResponse })
  @ApiResponse({ status: 400, schema: openApiDashboard.failures.validation })
  @ApiResponse({ status: 401, schema: openApiDashboard.failures.unauthorized })
  @ApiResponse({ status: 403, schema: openApiDashboard.failures.forbidden })
  getSummary(
    @Query(queryPipe) query: AdminDashboardQueryDto,
  ): Promise<AdminDashboardResponse> {
    return this.dashboard.getSummary(query);
  }
}
