import { Body, Controller, Get, Inject, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type {
  FinancialPolicySettingsUpdateResponse,
  SellerLegalBlockUpdateResponse,
  SettingsAdminSnapshotResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import {
  FinancialPolicySettingsUpdateDto,
  SellerLegalBlockUpdateDto,
  openApiSettingsFailures,
  openApiSettingsSchemas,
} from './settings.dto';
import { SettingsService } from './settings.service';

const settingsFailure = openApiSettingsFailures;

@ApiTags('settings')
@ApiBearerAuth('access-token')
@Controller({ path: 'settings/admin', version: '1' })
export class SettingsAdminController {
  constructor(
    @Inject(SettingsService)
    private readonly settings: SettingsService,
  ) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Read the current configurable settings snapshot (financial policy and seller legal block).' })
  @ApiResponse({
    status: 200,
    schema: openApiSettingsSchemas.snapshotResponse,
    description: 'Typed settings snapshot with optimistic-concurrency versions; secret values are never returned verbatim.',
  })
  @ApiResponse({ status: 401, schema: settingsFailure.unauthorized, description: settingsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: settingsFailure.forbidden, description: settingsFailure.forbidden.description })
  getSnapshot(): Promise<SettingsAdminSnapshotResponse> {
    return this.settings.getSnapshot();
  }

  @Put('financial-policy')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Replace the financial policy value with optimistic concurrency.' })
  @ApiBody({ schema: openApiSettingsSchemas.financialPolicyUpdate })
  @ApiResponse({
    status: 200,
    schema: openApiSettingsSchemas.financialPolicyEntry,
    description: 'Updated financial policy entry at the new version; conflicts return CONFLICT.',
  })
  @ApiResponse({ status: 400, schema: settingsFailure.validation, description: settingsFailure.validation.description })
  @ApiResponse({ status: 401, schema: settingsFailure.unauthorized, description: settingsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: settingsFailure.forbidden, description: settingsFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: settingsFailure.conflict, description: settingsFailure.conflict.description })
  updateFinancialPolicy(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: FinancialPolicySettingsUpdateDto,
  ): Promise<FinancialPolicySettingsUpdateResponse> {
    return this.settings.updateFinancialPolicy(
      { actorUserId: principal.userId, requestId: getRequestId() },
      { expectedVersion: input.expectedVersion, value: input.value },
    );
  }

  @Put('seller-legal-block')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Replace the seller legal disclosure block with optimistic concurrency.' })
  @ApiBody({ schema: openApiSettingsSchemas.sellerLegalBlockUpdate })
  @ApiResponse({
    status: 200,
    schema: openApiSettingsSchemas.sellerLegalBlockEntry,
    description: 'Updated seller legal block entry at the new version; conflicts return CONFLICT.',
  })
  @ApiResponse({ status: 400, schema: settingsFailure.validation, description: settingsFailure.validation.description })
  @ApiResponse({ status: 401, schema: settingsFailure.unauthorized, description: settingsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: settingsFailure.forbidden, description: settingsFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: settingsFailure.conflict, description: settingsFailure.conflict.description })
  updateSellerLegalBlock(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SellerLegalBlockUpdateDto,
  ): Promise<SellerLegalBlockUpdateResponse> {
    return this.settings.updateSellerLegalBlock(
      { actorUserId: principal.userId, requestId: getRequestId() },
      { expectedVersion: input.expectedVersion, value: input.value },
    );
  }
}
