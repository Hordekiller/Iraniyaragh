import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  PAYMENT_GATEWAY_CONFIG,
  PAYMENT_PROVIDER,
  type PaymentGatewayConfig,
  type PaymentGatewayEnvironment,
  type PaymentProvider,
} from './payment-provider.port';
import { ZarinpalProvider, type ZarinpalGatewayConfig } from './zarinpal.provider';

const DEFAULT_DEV_TIMEOUT_MS = 5_000;
const SANDBOX_MERCHANT_ID =
  '07f088c1-ee9b-4905-9077-b211439d1e33';
const DEV_CALLBACK_URL = 'http://localhost:4321/api/v1/payments/zarinpal/callback';

function requiredBoundedInteger(value: string | undefined, name: string, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function createPaymentGatewayConfig(config: ConfigService): PaymentGatewayConfig {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  const devOrTest = environment === 'development' || environment === 'test';
  const rawMode = config.get<string>('PAYMENT_PROVIDER_MODE');
  const mode: PaymentGatewayEnvironment =
    rawMode === 'live' || rawMode === 'sandbox' ? rawMode : devOrTest ? 'sandbox' : 'live';

  const callbackUrl = config.get<string>('ZARINPAL_CALLBACK_URL');
  if (!devOrTest && (callbackUrl === undefined || callbackUrl.length === 0)) {
    throw new Error('ZARINPAL_CALLBACK_URL is required outside development and test.');
  }
  const resolvedCallbackUrl = callbackUrl ?? DEV_CALLBACK_URL;

  const timeoutRaw = config.get<string>('ZARINPAL_TIMEOUT_MS');
  const timeoutMs = timeoutRaw == null || timeoutRaw === '' ? DEFAULT_DEV_TIMEOUT_MS : requiredBoundedInteger(
    timeoutRaw,
    'ZARINPAL_TIMEOUT_MS',
    500,
    10_000,
  );

  return Object.freeze({
    providerName: 'zarinpal' as const,
    mode,
    callbackUrl: resolvedCallbackUrl,
    timeoutMs,
  });
}

function createZarinpalProvider(config: ConfigService, gateway: PaymentGatewayConfig): PaymentProvider {
  const merchantId =
    gateway.mode === 'live'
      ? (() => {
          const merchant = config.get<string>('ZARINPAL_MERCHANT_ID');
          if (merchant === undefined || merchant.length === 0) {
            throw new Error('ZARINPAL_MERCHANT_ID is required when the payment gateway is live.');
          }
          return merchant;
        })()
      : config.get<string>('ZARINPAL_SANDBOX_MERCHANT_ID') ?? SANDBOX_MERCHANT_ID;
  const providerConfig: ZarinpalGatewayConfig = {
    merchantId,
    mode: gateway.mode,
    timeoutMs: gateway.timeoutMs,
    callbackUrl: gateway.callbackUrl,
  };
  return new ZarinpalProvider(providerConfig);
}

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PAYMENT_GATEWAY_CONFIG,
      inject: [ConfigService],
      useFactory: createPaymentGatewayConfig,
    },
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService, PAYMENT_GATEWAY_CONFIG],
      useFactory: createZarinpalProvider,
    },
  ],
  exports: [PAYMENT_GATEWAY_CONFIG, PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}