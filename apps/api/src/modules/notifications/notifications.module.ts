import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsAdminController } from './notifications.admin.controller';
import { EnvironmentSmsSettingsStore } from './environment-sms-settings.store';
import { SMS_SETTINGS_STORE } from './sms-settings.port';
import { SmsSettingsService } from './sms-settings.service';
import { SmsTransportModule } from './sms-transport.module';

@Module({
  imports: [AuditModule, ConfigModule, SmsTransportModule],
  controllers: [NotificationsAdminController],
  providers: [
    SmsSettingsService,
    {
      provide: SMS_SETTINGS_STORE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new EnvironmentSmsSettingsStore(config),
    },
  ],
  exports: [SMS_SETTINGS_STORE, SmsTransportModule],
})
export class NotificationsModule {}
