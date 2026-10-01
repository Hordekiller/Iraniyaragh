import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory, type INestApplicationContext } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DisabledPaymentProvider } from './disabled-payment.provider';
import {
  PAYMENT_GATEWAY_CONFIG,
  PAYMENT_PROVIDER,
  type PaymentGatewayConfig,
  type PaymentProvider,
} from './payment-provider.port';
import { PaymentProviderModule } from './payment-provider.module';
import { ZarinpalProvider } from './zarinpal.provider';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: false }), PaymentProviderModule],
})
class Harness {}

const PAYMENT_ENV = {
  NODE_ENV: 'staging',
  PAYMENT_PROVIDER_MODE: 'live',
  ZARINPAL_MERCHANT_ID: '11111111-2222-3333-4444-555555555555',
  ZARINPAL_CALLBACK_URL: 'https://staging.example.com/api/v1/payments/zarinpal/callback',
} as const;

function applyEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('PaymentProviderModule provider selection', () => {
  const saved = { ...process.env };
  let app: INestApplicationContext;

  beforeAll(async () => {
    applyEnv(PAYMENT_ENV);
    app = await NestFactory.createApplicationContext(Harness, { abortOnError: false });
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it('binds the real Zarinpal client when the gateway is live', () => {
    expect(app.get<PaymentProvider>(PAYMENT_PROVIDER)).toBeInstanceOf(ZarinpalProvider);
    expect(app.get<PaymentGatewayConfig>(PAYMENT_GATEWAY_CONFIG).mode).toBe('live');
  });

  it('binds the disabled provider without a merchant id or callback url', async () => {
    applyEnv({
      ...PAYMENT_ENV,
      PAYMENT_PROVIDER_MODE: 'disabled',
      ZARINPAL_MERCHANT_ID: undefined,
      ZARINPAL_CALLBACK_URL: undefined,
    });
    const context = await NestFactory.createApplicationContext(Harness, { abortOnError: false });
    try {
      const provider = context.get<PaymentProvider>(PAYMENT_PROVIDER);
      expect(provider).toBeInstanceOf(DisabledPaymentProvider);
      expect(context.get<PaymentGatewayConfig>(PAYMENT_GATEWAY_CONFIG).mode).toBe('disabled');
      expect(await provider.authorize()).toEqual({ status: 'disabled' });
      expect(await provider.verify()).toEqual({ status: 'disabled' });
    } finally {
      await context.close();
    }
  });

  it('refuses to construct in production when payments are disabled', async () => {
    applyEnv({ ...PAYMENT_ENV, NODE_ENV: 'production', PAYMENT_PROVIDER_MODE: 'disabled' });
    await expect(NestFactory.createApplicationContext(Harness, { abortOnError: false })).rejects.toThrow(
      /PAYMENT_PROVIDER_MODE=disabled is not allowed in production/u,
    );
  });

  it('refuses to build the real client in staging when the merchant id is missing', async () => {
    applyEnv({ ...PAYMENT_ENV, ZARINPAL_MERCHANT_ID: undefined });
    await expect(NestFactory.createApplicationContext(Harness, { abortOnError: false })).rejects.toThrow(
      /ZARINPAL_MERCHANT_ID is required when the payment gateway is live/u,
    );
  });
});
