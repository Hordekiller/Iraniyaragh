import 'reflect-metadata';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory, type INestApplicationContext } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DisabledSmsProvider } from './disabled-sms.provider';
import { FakeSmsProvider } from './fake-sms.provider';
import { SmsIrProvider } from './sms-ir.provider';
import { SMS_PROVIDER, type SmsProvider } from './sms-provider';
import { SmsTransportModule } from './sms-transport.module';

// Bootstrap unit evidence: the database is stubbed; no staging connection or send.
vi.mock('../../database/prisma.service', () => ({ PrismaService: class {
  smsTemplateSettings = { findUnique: async () => null };
} }));

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: false }), SmsTransportModule],
})
class Harness {}

const SMS_ENV = {
  NODE_ENV: 'staging',
  SMS_PROVIDER_MODE: 'smsir',
  SMS_IR_API_KEY: 'staging-sms-ir-api-key',
  SMS_IR_OTP_TEMPLATE_ID: '123456',
  SMS_IR_ORDER_PAID_TEMPLATE_ID: '123457',
  SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID: '123458',
  SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID: '123459',
} as const;

function applyEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('SmsTransportModule provider selection', () => {
  const saved = { ...process.env };
  let app: INestApplicationContext;

  beforeAll(async () => {
    applyEnv(SMS_ENV);
    app = await NestFactory.createApplicationContext(Harness, { abortOnError: false });
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it('binds the real SMS.ir transport when SMS is enabled in staging', () => {
    expect(app.get<SmsProvider>(SMS_PROVIDER)).toBeInstanceOf(SmsIrProvider);
  });

  it('binds the disabled transport when SMS_PROVIDER_MODE=disabled', async () => {
    applyEnv({ ...SMS_ENV, SMS_PROVIDER_MODE: 'disabled', SMS_IR_API_KEY: undefined });
    const context = await NestFactory.createApplicationContext(Harness, { abortOnError: false });
    try {
      const provider = context.get<SmsProvider>(SMS_PROVIDER);
      expect(provider).toBeInstanceOf(DisabledSmsProvider);
      const result = await provider.send({
        purpose: 'customer_login',
        destination: '09120000000',
        templateId: 0,
        parameters: { Code: '111111' },
        correlationId: 'req-1',
      });
      expect(result).toEqual({ status: 'disabled' });
    } finally {
      await context.close();
    }
  });

  it('keeps the fake transport in test so unit tests never reach SMS.ir', () => {
    applyEnv({ ...SMS_ENV, NODE_ENV: 'test' });
    return NestFactory.createApplicationContext(Harness, { abortOnError: false }).then(async context => {
      try {
        expect(context.get<SmsProvider>(SMS_PROVIDER)).toBeInstanceOf(FakeSmsProvider);
      } finally {
        await context.close();
      }
    });
  });

  it('refuses to construct in production when SMS is disabled', async () => {
    applyEnv({ ...SMS_ENV, NODE_ENV: 'production', SMS_PROVIDER_MODE: 'disabled' });
    await expect(NestFactory.createApplicationContext(Harness, { abortOnError: false })).rejects.toThrow(
      /SMS_PROVIDER_MODE=disabled is not allowed in production/u,
    );
  });
});
