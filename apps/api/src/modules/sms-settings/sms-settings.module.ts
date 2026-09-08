import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { SmsSettingsController } from './sms-settings.controller';
import { DisconnectedSmsSettingsStore } from './sms-settings.disconnected';
import { SMS_SETTINGS_STORE } from './sms-settings.port';
import { SmsSettingsAdminService } from './sms-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [SmsSettingsController],
  providers: [SmsSettingsAdminService, { provide: SMS_SETTINGS_STORE, useClass: DisconnectedSmsSettingsStore }],
  exports: [SMS_SETTINGS_STORE],
})
export class SmsSettingsModule {}