import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { NotificationsAdminController } from './notifications.admin.controller';
import { DisconnectedSmsSettingsStore } from './sms-settings.disconnected';
import { SMS_SETTINGS_STORE } from './sms-settings.port';
import { SmsSettingsService } from './sms-settings.service';

@Module({
  imports: [AuditModule],
  controllers: [NotificationsAdminController],
  providers: [SmsSettingsService, { provide: SMS_SETTINGS_STORE, useClass: DisconnectedSmsSettingsStore }],
  exports: [SMS_SETTINGS_STORE],
})
export class NotificationsModule {}