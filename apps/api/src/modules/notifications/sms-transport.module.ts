import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FakeSmsProvider } from './fake-sms.provider';
import { SmsIrProvider } from './sms-ir.provider';
import { CUSTOMER_OTP_SMS_CONFIG, SMS_PROVIDER, type CustomerOtpSmsConfig, type SmsProvider } from './sms-provider';

function requiredBoundedInteger(value: string | undefined, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function requiredApiKey(value: string | undefined): string {
  if (value === undefined || value.length === 0)
    throw new Error('SMS_IR_API_KEY is required outside development and test.');
  const invalid = [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return /\s/u.test(character) || codePoint <= 31 || codePoint === 127;
  });
  if (invalid) throw new Error('SMS_IR_API_KEY must not contain whitespace or control characters.');
  return value;
}

function createOtpSmsConfig(config: ConfigService): CustomerOtpSmsConfig {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  if (environment === 'development' || environment === 'test') {
    return Object.freeze({ templateId: 1, codeParameterName: 'Code' });
  }
  return Object.freeze({
    templateId: requiredBoundedInteger(
      config.get<string>('SMS_IR_OTP_TEMPLATE_ID'),
      'SMS_IR_OTP_TEMPLATE_ID',
      1,
      9_999_999_999,
    ),
    codeParameterName: 'Code',
  });
}

function createSmsProvider(config: ConfigService): SmsProvider {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  if (environment === 'development' || environment === 'test') return new FakeSmsProvider();
  const apiKey = requiredApiKey(config.get<string>('SMS_IR_API_KEY'));
  const timeoutRaw = config.get<string>('SMS_IR_TIMEOUT_MS');
  const timeoutMs =
    timeoutRaw === undefined ? 5_000 : requiredBoundedInteger(timeoutRaw, 'SMS_IR_TIMEOUT_MS', 500, 10_000);
  return new SmsIrProvider({ apiKey, timeoutMs });
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: CUSTOMER_OTP_SMS_CONFIG,
      inject: [ConfigService],
      useFactory: createOtpSmsConfig,
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: createSmsProvider,
    },
  ],
  exports: [CUSTOMER_OTP_SMS_CONFIG, SMS_PROVIDER],
})
export class SmsTransportModule {}
