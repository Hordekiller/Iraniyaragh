import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { SmsSettingsApiClient } from '../sms-settings-api';
import {
  SmsInvalidInputError,
  SmsNetworkError,
  SmsReauthenticationRequiredError,
  SmsSessionExpiredError,
  SmsUpstreamError,
} from '../sms-settings-port';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client')>();
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => apiFetchMock(...(args as [])) as never,
  };
});

function errorEnvelope(code: string, statusCode = 400, message = `msg-${code}`) {
  return { code, message, requestId: 'r1', statusCode };
}

function mockEnvelope(code: string, statusCode = 400): void {
  apiFetchMock.mockRejectedValueOnce(new ApiClientError(errorEnvelope(code, statusCode)));
}

describe('SmsSettingsApiClient error mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const client = new SmsSettingsApiClient(() => 'at-1');

  it('maps VALIDATION_ERROR to invalid_input instead of a provider error', async () => {
    mockEnvelope('VALIDATION_ERROR', 400);
    await expect(client.update({ expectedVersion: 3, patch: { enabled: true } })).rejects.toBeInstanceOf(
      SmsInvalidInputError,
    );
  });

  it('maps AUTH_SESSION_INVALID to an actionable session-expired error', async () => {
    mockEnvelope('AUTH_SESSION_INVALID', 401);
    await expect(client.getSnapshot()).rejects.toBeInstanceOf(SmsSessionExpiredError);
  });

  it('maps AUTH_REAUTHENTICATION_REQUIRED to a re-authentication error', async () => {
    mockEnvelope('AUTH_REAUTHENTICATION_REQUIRED', 401);
    await expect(client.validate()).rejects.toBeInstanceOf(SmsReauthenticationRequiredError);
  });

  it('maps network failure to SmsNetworkError', async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiNetworkError('offline'));
    await expect(client.diagnostics()).rejects.toBeInstanceOf(SmsNetworkError);
  });

  it('surfaces unknown error codes as provider/unknown errors', async () => {
    mockEnvelope('PROVIDER_HAZARD', 502);
    await expect(client.testSend({ confirm: true, idempotencyKey: 'test-client-0001' })).rejects.toBeInstanceOf(SmsUpstreamError);
  });

  it('returns snapshot data on a successful read', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: { snapshot: { version: 3 } },
    });
    const result = await client.getSnapshot();
    expect(result.version).toBe(3);
  });
});