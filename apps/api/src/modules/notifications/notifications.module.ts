import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';
import { SmsOperatorTestService } from './sms-operator-test.service';
import { AuditModule } from '../audit/audit.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsAdminController } from './notifications.admin.controller';
import { EnvironmentSmsSettingsStore } from './environment-sms-settings.store';
import { SMS_SETTINGS_STORE } from './sms-settings.port';
import { SmsSettingsService } from './sms-settings.service';
import { SmsTemplateSettingsService } from './sms-template-settings.service';
import { SmsTransportModule } from './sms-transport.module';

@Module({
  imports: [AuditModule, ConfigModule, SmsTransportModule, DatabaseModule],
  controllers: [NotificationsAdminController],
  providers: [
    SmsSettingsService,
    SmsOperatorTestService,
    {
      provide: SMS_SETTINGS_STORE,
      inject: [ConfigService, SMS_PROVIDER, SmsOperatorTestService, SmsTemplateSettingsService],
      useFactory: (config: ConfigService, provider: SmsProvider, operatorTest: SmsOperatorTestService, templates: SmsTemplateSettingsService) =>
        new EnvironmentSmsSettingsStore(config, provider, operatorTest, templates),
    },
  ],
  exports: [SMS_SETTINGS_STORE, SmsTransportModule],
})
export class NotificationsModule {}
