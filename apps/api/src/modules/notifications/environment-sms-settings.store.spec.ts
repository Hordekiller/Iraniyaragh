import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';
import { EnvironmentSmsSettingsStore } from './environment-sms-settings.store';

function store(values: Record<string, unknown>) {
  return new EnvironmentSmsSettingsStore(new ConfigService(values));
}

describe('EnvironmentSmsSettingsStore', () => {
  it('projects configured production state without exposing the secret', async () => {
    const apiKey = 'private-sms-ir-api-key';
    const subject = store({
      NODE_ENV: 'production',
      SMS_IR_API_KEY: apiKey,
      SMS_IR_OTP_TEMPLATE_ID: 123456,
      SMS_IR_TIMEOUT_MS: 2_500,
    });

    const snapshot = await subject.read();
    expect(snapshot).toMatchObject({
      version: 1,
      settings: {
        enabled: true,
        environment: 'production',
        templateId: 123456,
        timeoutMs: 2_500,
        outageMode: false,
      },
      secret: { configured: true, masked: '••••••••', validated: false },
      secretBackend: 'read_only',
    });
    expect(JSON.stringify(snapshot)).not.toContain(apiKey);
  });

  it('fails closed and reports not-configured in local/fake environments', async () => {
    const subject = store({ NODE_ENV: 'test' });
    expect(await subject.read()).toMatchObject({
      settings: { enabled: false, environment: 'development', templateId: null, outageMode: true },
      secret: { configured: false, masked: null },
    });
    expect(await subject.diagnostics()).toMatchObject({
      providerHealth: 'not_configured',
      lastErrorClass: 'not_configured',
    });
  });

  it('never claims provider health before a provider-bound check', async () => {
    const subject = store({
      NODE_ENV: 'staging',
      SMS_IR_API_KEY: 'private-key',
      SMS_IR_OTP_TEMPLATE_ID: 123456,
    });
    expect(await subject.validateConfiguration()).toMatchObject({
      checked: false,
      providerHealth: 'unknown',
      errorClass: null,
    });
    expect(await subject.diagnostics()).toMatchObject({ providerHealth: 'unknown', circuitState: 'unknown' });
  });

  it('rejects every mutation rather than pretending to change environment state', async () => {
    const subject = store({ NODE_ENV: 'development' });
    await expect(subject.update({ expectedVersion: 1, patch: { enabled: true } }, 'request-1')).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    await expect(subject.rotateSecret()).rejects.toMatchObject({ response: { code: 'OPERATION_UNSUPPORTED' } });
    await expect(subject.clearSecret()).rejects.toMatchObject({ response: { code: 'OPERATION_UNSUPPORTED' } });
  });

  it('does not allow a controlled send without a private approved destination', async () => {
    await expect(store({ NODE_ENV: 'development' }).submitTestSend('test-key-1', 'req-1')).rejects.toMatchObject({
      response: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
  it('reports disabled delivery even when an environment key exists', async () => {
    const checkHealth = vi.fn();
    const subject = new EnvironmentSmsSettingsStore(new ConfigService({ NODE_ENV: 'staging',
      SMS_PROVIDER_MODE: 'disabled', SMS_IR_API_KEY: 'unit-key', SMS_IR_OTP_TEMPLATE_ID: 123 }),
      { send: vi.fn(), checkHealth });
    expect(await subject.read()).toMatchObject({ settings: { enabled: false, outageMode: true }, secret: { configured: true } });
    expect(await subject.validateConfiguration()).toMatchObject({ checked: false, providerHealth: 'not_configured' });
    expect(checkHealth).not.toHaveBeenCalled();
  });

  it('projects only real account-check results and keeps diagnostics read-only', async () => {
    const checkHealth = vi.fn(async () => ({ checked: true, providerHealth: 'ok' as const,
      errorClass: null, lastCheckedAt: '2026-10-04T12:00:00.000Z' }));
    const send = vi.fn();
    const subject = new EnvironmentSmsSettingsStore(new ConfigService({ NODE_ENV: 'staging',
      SMS_IR_API_KEY: 'unit-key', SMS_IR_OTP_TEMPLATE_ID: 123 }), { send, checkHealth });
    expect(await subject.diagnostics()).toMatchObject({ providerHealth: 'unknown' });
    expect(checkHealth).not.toHaveBeenCalled();
    expect(await subject.validateConfiguration()).toMatchObject({ checked: true, providerHealth: 'ok' });
    expect(await subject.read()).toMatchObject({ secret: { validated: true } });
    expect(await subject.diagnostics()).toMatchObject({ providerHealth: 'ok' });
    expect(send).not.toHaveBeenCalled();
  });

  it('sanitizes unexpected health errors and never marks a key validated', async () => {
    const subject = new EnvironmentSmsSettingsStore(new ConfigService({ NODE_ENV: 'staging',
      SMS_IR_API_KEY: 'unit-key', SMS_IR_OTP_TEMPLATE_ID: 123 }), { send: vi.fn(), checkHealth: async () => {
        throw new Error('private-provider-error');
      } });
    expect(await subject.validateConfiguration()).toMatchObject({ providerHealth: 'unknown', errorClass: 'provider_error' });
    expect(await subject.read()).toMatchObject({ secret: { validated: false } });
    expect(JSON.stringify(await subject.diagnostics())).not.toContain('private-provider-error');
  });

  it('delegates an explicitly confirmed test only to the durable operator service', async () => {
    const send = vi.fn(async () => ({ status: 'unknown_result' as const, messageId: null }));
    const subject = new EnvironmentSmsSettingsStore(new ConfigService({ NODE_ENV: 'staging',
      SMS_IR_API_KEY: 'unit-key', SMS_IR_OTP_TEMPLATE_ID: 123 }), undefined, { send });
    expect(await subject.submitTestSend('test-key-1', 'req-1')).toEqual({ status: 'unknown_result', messageId: null });
    expect(send).toHaveBeenCalledWith('test-key-1', 'req-1');
  });

});
