import { Body, Controller, Delete, Get, Patch, Post } from '@nestjs/common';
import type {
  SmsDiagnosticsResponse,
  SmsSettingsResponse,
  SmsTestSendResponse,
} from '@iranyaragh/contracts';
import {
  CurrentPrincipal,
  RequireAuthentication,
  RequireFreshAuthentication,
  RequirePermission,
} from '../auth/auth.guard';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import type { SmsSettingsRotateSecretDto, SmsSettingsTestSendDto, SmsSettingsUpdateDto } from './sms-settings.dto';
import { SmsSettingsAdminService } from './sms-settings.service';

@Controller({ path: 'admin/sms-settings', version: '1' })
export class SmsSettingsController {
  constructor(private readonly admin: SmsSettingsAdminService) {}

  @Get()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  async getSettings(): Promise<SmsSettingsResponse> {
    return this.admin.read();
  }

  @Patch()
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  async updateSettings(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsUpdateDto,
  ): Promise<SmsSettingsResponse> {
    return this.admin.update(principal.userId, input);
  }

  @Post('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  async rotateSecret(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsRotateSecretDto,
  ): Promise<SmsSettingsResponse> {
    return this.admin.rotateSecret(principal.userId, input);
  }

  @Delete('secret')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  async clearSecret(@CurrentPrincipal() principal: AuthPrincipalContext): Promise<SmsSettingsResponse> {
    return this.admin.clearSecret(principal.userId);
  }

  @Post('test-send')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  @RequireFreshAuthentication('STAFF_MFA')
  async testSend(
    @CurrentPrincipal() principal: AuthPrincipalContext,
    @Body() input: SmsSettingsTestSendDto,
  ): Promise<SmsTestSendResponse> {
    return this.admin.testSend(principal.userId, input);
  }

  @Get('diagnostics')
  @RequireAuthentication('STAFF_MFA')
  @RequirePermission('sms-settings.manage')
  async diagnostics(): Promise<SmsDiagnosticsResponse> {
    return this.admin.diagnostics();
  }
}