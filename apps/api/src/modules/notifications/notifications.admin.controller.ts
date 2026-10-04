import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  Put,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type {
  SmsTemplateSettingsResponse,
  SmsDiagnosticsResponse,
  SmsSettingsResponse,
  SmsTestSendResponse,
  SmsValidateResponse,
  SmsSettingsUpdatePayload,
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
  SmsSettingsClearSecretDto,
  SmsSettingsRotateSecretDto,
  SmsSettingsTestSendDto,
  SmsSettingsUpdateDto,
} from './sms-settings.dto';
import { openApiSmsBodies, openApiSmsFailures, openApiSmsSchemas } from './sms-settings.dto';
import { SmsTemplateSettingsService } from './sms-template-settings.service';
import { SmsTemplateSettingsUpdateDto, smsTemplateUpdateSchema, smsTemplateResponseSchema } from './sms-template-settings.dto';
import { SmsSettingsService } from './sms-settings.service';

const smsFailure = openApiSmsFailures;

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Controller({ path: 'notifications/admin/sms-settings', version: '1' })
export class NotificationsAdminController {
  constructor(
    @Inject(SmsSettingsService)
    private readonly settings: SmsSettingsService,
    @Inject(SmsTemplateSettingsService) private readonly templates: SmsTemplateSettingsService,
  ) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Read current SMS provider settings and secret status.' })
  @ApiResponse({
    status: 200,
    schema: openApiSmsSchemas.settingsResponse,
    description: 'Sanitized settings snapshot with masked secret status; never the raw secret.',
  })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  getSettings(): Promise<SmsSettingsResponse> {
    return this.settings.getSettings();
  }

  @Put()
  @ApiResponse({ status: 422, schema: smsFailure.unprocessable, description: 'Environment-managed settings are read-only.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Patch SMS provider settings with optimistic concurrency.' })
  @ApiBody({ schema: openApiSmsBodies.update })
  @ApiResponse({
    status: 200,
    schema: openApiSmsSchemas.settingsResponse,
    description: 'Updated snapshot at the new version; conflicts return CONFLICT.',
  })
  @ApiResponse({ status: 400, schema: smsFailure.validation, description: smsFailure.validation.description })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  @ApiResponse({ status: 409, schema: smsFailure.conflict, description: smsFailure.conflict.description })
  @ApiResponse({ status: 503, schema: smsFailure.upstream, description: smsFailure.upstream.description })
  updateSettings(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: SmsSettingsUpdateDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: SmsSettingsUpdateDto,
  ): Promise<SmsSettingsResponse> {
    const payload: SmsSettingsUpdatePayload = { expectedVersion: input.expectedVersion, patch: input.patch };
    return this.settings.updateSettings({ actorUserId: principal.userId, requestId: getRequestId() }, payload);
  }

  @Post('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Rotate the SMS provider secret (write-only, idempotent).' })
  @ApiBody({ schema: openApiSmsBodies.rotateSecret })
  @ApiResponse({
    status: 201,
    schema: openApiSmsSchemas.settingsResponse,
    description: 'Secret rotated; only the masked status and last-rotated time are returned.',
  })
  @ApiResponse({ status: 400, schema: smsFailure.validation, description: smsFailure.validation.description })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  @ApiResponse({ status: 422, schema: smsFailure.unprocessable, description: smsFailure.unprocessable.description })
  @ApiResponse({ status: 503, schema: smsFailure.upstream, description: smsFailure.upstream.description })
  rotateSecret(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: SmsSettingsRotateSecretDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: SmsSettingsRotateSecretDto,
  ): Promise<SmsSettingsResponse> {
    return this.settings.rotateSecret({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Delete('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Clear the configured SMS provider secret.' })
  @ApiBody({ schema: openApiSmsBodies.clearSecret })
  @ApiResponse({
    status: 200,
    schema: openApiSmsSchemas.settingsResponse,
    description: 'Secret cleared; only the masked status is returned.',
  })
  @ApiResponse({ status: 400, schema: smsFailure.validation, description: smsFailure.validation.description })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  @ApiResponse({ status: 422, schema: smsFailure.unprocessable, description: smsFailure.unprocessable.description })
  @ApiResponse({ status: 503, schema: smsFailure.upstream, description: smsFailure.upstream.description })
  clearSecret(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: SmsSettingsClearSecretDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: SmsSettingsClearSecretDto,
  ): Promise<SmsSettingsResponse> {
    return this.settings.clearSecret({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Post('validate')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Validate the provider connection without sending to arbitrary numbers.' })
  @ApiResponse({
    status: 201,
    schema: openApiSmsSchemas.validateResponse,
    description: 'Validation health report with sanitized error category.',
  })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  @ApiResponse({ status: 503, schema: smsFailure.upstream, description: smsFailure.upstream.description })
  validateConfiguration(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<SmsValidateResponse> {
    return this.settings.validateConfiguration({ actorUserId: principal.userId, requestId: getRequestId() });
  }

  @Post('test-send')
  @ApiResponse({ status: 409, schema: smsFailure.conflict, description: 'Idempotency key conflicts with changed private test configuration.' })
  @ApiResponse({ status: 429, description: 'Controlled test cooldown; Retry-After header is authoritative.' })
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Send a controlled SMS test to the approved operator destination.' })
  @ApiBody({ schema: openApiSmsBodies.testSend })
  @ApiResponse({
    status: 201,
    schema: openApiSmsSchemas.testSendResponse,
    description: 'Controlled send outcome; no destination, OTP body or API key in the response.',
  })
  @ApiResponse({ status: 400, schema: smsFailure.validation, description: smsFailure.validation.description })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  @ApiResponse({ status: 422, schema: smsFailure.unprocessable, description: smsFailure.unprocessable.description })
  @ApiResponse({ status: 503, schema: smsFailure.upstream, description: smsFailure.upstream.description })
  sendControlledTest(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: SmsSettingsTestSendDto, whitelist: true, forbidNonWhitelisted: true, transform: true })) input: SmsSettingsTestSendDto,
  ): Promise<SmsTestSendResponse> {
    return this.settings.sendControlledTest({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Get('templates')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Read the four non-secret template IDs; configured does not mean provider approved.' })
  @ApiResponse({ status: 200, schema: smsTemplateResponseSchema })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden })
  async getTemplates(): Promise<SmsTemplateSettingsResponse> {
    return { data: { templates: await this.templates.read() } };
  }

  @Put('templates')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  @ApiOperation({ summary: 'Persist approved template IDs with version checking and idempotent replay; never enables SMS or changes its secret.' })
  @ApiBody({ schema: smsTemplateUpdateSchema })
  @ApiResponse({ status: 200, schema: smsTemplateResponseSchema })
  @ApiResponse({ status: 400, schema: smsFailure.validation })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden })
  @ApiResponse({ status: 409, schema: smsFailure.conflict })
  @ApiResponse({ status: 422, schema: smsFailure.unprocessable })
  async updateTemplates(@CurrentPrincipal() principal: AuthPrincipalContext,
    @Body(new ValidationPipe({ expectedType: SmsTemplateSettingsUpdateDto, whitelist: true,
      forbidNonWhitelisted: true, transform: true })) input: SmsTemplateSettingsUpdateDto): Promise<SmsTemplateSettingsResponse> {
    return { data: { templates: await this.templates.update(principal.userId, getRequestId(), input) } };
  }

  @Get('diagnostics')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Read provider health, circuit state and last successful send time.' })
  @ApiResponse({
    status: 200,
    schema: openApiSmsSchemas.diagnosticsResponse,
    description: 'Diagnostics with masked/sanitized values only.',
  })
  @ApiResponse({ status: 401, schema: smsFailure.unauthorized, description: smsFailure.unauthorized.description })
  @ApiResponse({ status: 403, schema: smsFailure.forbidden, description: smsFailure.forbidden.description })
  getDiagnostics(): Promise<SmsDiagnosticsResponse> {
    return this.settings.getDiagnostics();
  }
}