import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FakeSmsProvider } from './fake-sms.provider';
import { SmsIrProvider } from './sms-ir.provider';
import {
  CUSTOMER_OTP_SMS_CONFIG,
  SMS_PROVIDER,
  type CustomerOtpSmsConfig,
  type SmsProvider,
} from './sms-provider';

function requiredPositiveInteger(value: string | undefined, name: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function createOtpSmsConfig(config: ConfigService): CustomerOtpSmsConfig {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  if (environment === 'development' || environment === 'test') {
    return Object.freeze({ templateId: 1, codeParameterName: 'Code' });
  }
  return Object.freeze({
    templateId: requiredPositiveInteger(config.get<string>('SMS_IR_OTP_TEMPLATE_ID'), 'SMS_IR_OTP_TEMPLATE_ID'),
    codeParameterName: 'Code',
  });
}

function createSmsProvider(config: ConfigService): SmsProvider {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  if (environment === 'development' || environment === 'test') return new FakeSmsProvider();
  const apiKey = config.get<string>('SMS_IR_API_KEY');
  if (!apiKey) throw new Error('SMS_IR_API_KEY is required outside development and test.');
  const timeoutRaw = config.get<string>('SMS_IR_TIMEOUT_MS');
  const timeoutMs = timeoutRaw === undefined ? 5_000 : requiredPositiveInteger(timeoutRaw, 'SMS_IR_TIMEOUT_MS');
  return new SmsIrProvider({ apiKey, timeoutMs });
}

@Module({
  imports: [ConfigModule],
  providers: [
    { provide: CUSTOMER_OTP_SMS_CONFIG, inject: [ConfigService], useFactory: createOtpSmsConfig },
    { provide: SMS_PROVIDER, inject: [ConfigService], useFactory: createSmsProvider },
  ],
  exports: [CUSTOMER_OTP_SMS_CONFIG, SMS_PROVIDER],
})
export class SmsTransportModule {}
