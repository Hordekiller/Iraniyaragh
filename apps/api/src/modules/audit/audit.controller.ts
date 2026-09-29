import { Controller, Get, Inject, Query, ValidationPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { AuditLogListResponse } from '@iranyaragh/contracts';
import { RequireAuthentication, RequirePermission } from '../auth/auth.guard';
import { AuditLogService } from './audit-log.service';
import { AuditLogListQueryDto } from './audit.dto';
import { auditOpenApi } from './audit.openapi';

const queryPipe = new ValidationPipe({
  expectedType: AuditLogListQueryDto,
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@ApiTags('audit')
@Controller({ path: 'audit/admin/logs', version: '1' })
@RequireAuthentication('STAFF_MFA')
export class AuditController {
  constructor(@Inject(AuditLogService) private readonly auditLog: AuditLogService) {}

  @Get()
  @RequirePermission('audit.read')
  @ApiOperation({ summary: 'List audit log entries with filters' })
  @ApiQuery({ name: 'offset', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100 })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'entityType', required: false, type: String })
  @ApiQuery({ name: 'entityId', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'createdFrom', required: false, type: String })
  @ApiQuery({ name: 'createdToExclusive', required: false, type: String })
  @ApiOkResponse({ schema: auditOpenApi.list })
  list(@Query(queryPipe) query: AuditLogListQueryDto): Promise<AuditLogListResponse> {
    return this.auditLog.list(query);
  }
}