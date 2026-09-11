import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
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
      checked: true,
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
    await expect(store({ NODE_ENV: 'development' }).submitTestSend()).rejects.toMatchObject({
      response: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
});
