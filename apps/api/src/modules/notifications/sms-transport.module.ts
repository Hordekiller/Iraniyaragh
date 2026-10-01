import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DisabledSmsProvider } from './disabled-sms.provider';
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

function smsMode(config: ConfigService, environment: string): 'smsir' | 'disabled' {
  const raw = config.get<string>('SMS_PROVIDER_MODE');
  if (raw === 'disabled') {
    // Staging affordance for deploying before an SMS.ir account exists.
    // Production must never resolve to it: a production deployment has to be
    // able to deliver OTPs and order notifications, and silently skipping them
    // would look like a working store to a customer.
    if (environment === 'production') {
      throw new Error('SMS_PROVIDER_MODE=disabled is not allowed in production.');
    }
    return 'disabled';
  }
  if (raw !== undefined && raw !== '' && raw !== 'smsir') {
    throw new Error("SMS_PROVIDER_MODE must be either 'smsir' or 'disabled'.");
  }
  return 'smsir';
}

function createOtpSmsConfig(config: ConfigService): CustomerOtpSmsConfig {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  if (environment === 'development' || environment === 'test') {
    return Object.freeze({ templateId: 1, codeParameterName: 'Code' });
  }
  if (smsMode(config, environment) === 'disabled') {
    // No template can be reached, so requiring an id would only force an
    // operator to invent one. The provider still refuses to dispatch, and
    // customer-otp turns that into an explicit unavailable response.
    return Object.freeze({ templateId: 0, codeParameterName: 'Code' });
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
  if (smsMode(config, environment) === 'disabled') return new DisabledSmsProvider();
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
