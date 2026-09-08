import { Body, Controller, Delete, Get, Post, Put } from '@nestjs/common';
import type {
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
import type {
  SmsSettingsClearSecretDto,
  SmsSettingsRotateSecretDto,
  SmsSettingsTestSendDto,
  SmsSettingsUpdateDto,
} from './sms-settings.dto';
import { SmsSettingsService } from './sms-settings.service';

@Controller({ path: 'notifications/admin/sms-settings', version: '1' })
export class NotificationsAdminController {
  constructor(private readonly settings: SmsSettingsService) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  getSettings(): Promise<SmsSettingsResponse> {
    return this.settings.getSettings();
  }

  @Put()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  updateSettings(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsUpdateDto,
  ): Promise<SmsSettingsResponse> {
    const payload: SmsSettingsUpdatePayload = { expectedVersion: input.expectedVersion, patch: input.patch };
    return this.settings.updateSettings({ actorUserId: principal.userId, requestId: getRequestId() }, payload);
  }

  @Post('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  rotateSecret(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsRotateSecretDto,
  ): Promise<SmsSettingsResponse> {
    return this.settings.rotateSecret({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Delete('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  clearSecret(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsClearSecretDto,
  ): Promise<SmsSettingsResponse> {
    return this.settings.clearSecret({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Post('validate')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  validateConfiguration(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<SmsValidateResponse> {
    return this.settings.validateConfiguration({ actorUserId: principal.userId, requestId: getRequestId() });
  }

  @Post('test-send')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  sendControlledTest(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsTestSendDto,
  ): Promise<SmsTestSendResponse> {
    return this.settings.sendControlledTest({ actorUserId: principal.userId, requestId: getRequestId() }, input);
  }

  @Get('diagnostics')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('settings.manage')
  getDiagnostics(): Promise<SmsDiagnosticsResponse> {
    return this.settings.getDiagnostics();
  }
}