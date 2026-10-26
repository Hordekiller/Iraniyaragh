import { Body, Controller, Get, Header, HttpCode, Inject, Headers, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { failureError } from '../orders/order-openapi-schemas';
import { getRequestId } from '../../common/request-context';
import { normalizeIdempotencyKey } from '../../common/idempotency-key';
import { reportExportOpenApi } from './report-export.openapi';
import {
  reportExportId,
  reportExportInvalid,
  validateReportExportDefinition,
} from './report-export.validation';
import { ReportExportJobService } from './report-export-job.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports/admin', version: '1' })
@RequireAuthentication('STAFF_MFA')
@RequirePermission('reports.read')
@ApiResponse({
  status: 400,
  schema: failureError(['INVALID_REQUEST', 'REPORT_EXPORT_INPUT_INVALID', 'REPORT_EXPORT_DISABLED'], 400),
})
@ApiResponse({
  status: 401,
  schema: failureError(['AUTH_SESSION_INVALID', 'AUTH_SESSION_REPLAYED'], 401),
})
@ApiResponse({ status: 403, schema: failureError(['FORBIDDEN'], 403) })
@ApiResponse({
  status: 500,
  schema: failureError(['REPORT_EXPORT_STORAGE_UNAVAILABLE'], 500),
})
export class ReportExportController {
  constructor(
    @Inject(ReportExportJobService)
    private readonly jobs: ReportExportJobService,
  ) {}

  /** Snapshot export request: reports.export replaces the read-level class guard. */
  @Post('exports')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @RequirePermission('reports.export')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiOkResponse({ schema: reportExportOpenApi.request })
  @ApiOperation({ summary: 'Request an approved report snapshot export' })
  @ApiResponse({
    status: 409,
    schema: failureError(
      ['REPORT_EXPORT_NOT_READY', 'REPORT_EXPORT_CAPACITY_EXCEEDED', 'IDEMPOTENCY_CONFLICT'],
      409,
    ),
  })
  async request(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() body: Record<string, unknown>,
    @Headers('idempotency-key') key: string,
  ) {
    if (!body || typeof body !== 'object') throw reportExportInvalid('An export request object is required.');
    if (Object.keys(body).some((allowed) => !['definition', 'format'].includes(allowed))) {
      throw reportExportInvalid('The export request takes one definition and one format.');
    }
    const definition = validateReportExportDefinition(body.definition);
    const outputFormat = body.format;
    if (typeof outputFormat !== 'string' || !['csv', 'xlsx'].includes(outputFormat)) {
      throw reportExportInvalid('Approved export formats are CSV and Excel.');
    }
    return {
      data: await this.jobs.request({
        actorId: principal.userId,
        requestId: getRequestId(),
        definition,
        outputFormat,
        key: normalizeIdempotencyKey(key),
      }),
    };
  }

  @Get('exports/:exportId')
  @RequirePermission('reports.export')
  @RequireFreshAuthentication('STAFF_MFA')
  @Header('Cache-Control', 'no-store')
  @ApiOkResponse({ schema: reportExportOpenApi.request })
  @ApiOperation({ summary: 'Poll one approved export request' })
  async status(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('exportId') exportId: string) {
    if (!principal.userId) throw reportExportInvalid('An actor identity is required.');
    return {
      data: await this.jobs.status(reportExportId(exportId), principal.userId),
    };
  }

  @Get('exports/:exportId/snapshot')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('reports.export')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOkResponse({ schema: reportExportOpenApi.snapshot })
  @ApiOperation({
    summary: 'Read the exact retained table behind a private export',
  })
  async snapshot(@CurrentPrincipal() principal: AuthPrincipalContext, @Param('exportId') exportId: string) {
    return {
      data: await this.jobs.snapshotStaff(reportExportId(exportId), principal.userId, getRequestId()),
    };
  }

  /** Verified artifact download; export permission replaces the read guard. */
  @Get('exports/:exportId/artifact')
  @Header('Cache-Control', 'no-store')
  @RequirePermission('reports.export')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Download the approved export artifact' })
  async download(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Param('exportId') exportId: string,
    @Res({ passthrough: false }) response: Response,
  ) {
    if (!principal.userId) throw reportExportInvalid('An actor identity is required.');
    const download = await this.jobs.downloadStaff(
      reportExportId(exportId),
      principal.userId,
      getRequestId(),
    );
    response.setHeader('Content-Type', download.contentType);
    response.setHeader('Content-Length', String(download.byteCount));
    response.setHeader('Content-Disposition', `attachment; filename="${download.filename}"`);
    response.setHeader('X-Content-SHA256', download.contentSha256);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(download.bytes);
    return response;
  }
}
