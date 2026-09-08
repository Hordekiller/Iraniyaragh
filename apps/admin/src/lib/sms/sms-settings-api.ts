import { ApiClientError, ApiNetworkError, apiFetch } from '@/lib/api/client';
import type {
  SmsDiagnostics,
  SmsDiagnosticsResponse,
  SmsSendOutcome,
  SmsSettingsClearSecretPayload,
  SmsSettingsRotateSecretPayload,
  SmsSettingsSnapshot,
  SmsSettingsTestSendPayload,
  SmsSettingsUpdatePayload,
  SmsTestSendResponse,
  SmsValidation,
  SmsValidateResponse,
} from '@iranyaragh/contracts';
import {
  SmsForbiddenError,
  SmsNetworkError,
  SmsReauthenticationRequiredError,
  SmsUnsupportedOperationError,
  SmsUpstreamError,
  SmsVersionConflictError,
  toSmsSettingsError,
  type SmsSettingsPort,
} from './sms-settings-port';

const SMS_SETTINGS_PATH = '/notifications/admin/sms-settings';

/**
 * HTTP implementation of `SmsSettingsPort` against the accepted #114/#118 API:
 *
 *   GET    /notifications/admin/sms-settings
 *   PUT    /notifications/admin/sms-settings            { expectedVersion, patch }
 *   POST   /notifications/admin/sms-settings/secret     { secret, confirm, idempotencyKey }
 *   DELETE /notifications/admin/sms-settings/secret     { confirm, idempotencyKey }
 *   POST   /notifications/admin/sms-settings/validate
 *   POST   /notifications/admin/sms-settings/test-send  { confirm, idempotencyKey }
 *   GET    /notifications/admin/sms-settings/diagnostics
 *
 * Every mutation requires STAFF_MFA + settings.manage (fresh auth on the server);
 * the client only maps the resulting error kinds so the UI can react.
 */
export class SmsSettingsApiClient implements SmsSettingsPort {
  constructor(private readonly getToken: () => string | null) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      const response = await apiFetch<T>(path, {
        method,
        token: this.getToken(),
        body,
      });
      return response.data;
    } catch (error) {
      throw this.mapError(error);
    }
  }

  private mapError(error: unknown): unknown {
    if (error instanceof ApiNetworkError) return new SmsNetworkError(error.message);
    if (!(error instanceof ApiClientError)) return toSmsSettingsError(error);

    switch (error.code) {
      case 'CONFLICT':
        return new SmsVersionConflictError();
      case 'OPERATION_UNSUPPORTED':
        return new SmsUnsupportedOperationError(error.message, error.code);
      case 'AUTH_REAUTHENTICATION_REQUIRED':
        return new SmsReauthenticationRequiredError(error.message);
      case 'FORBIDDEN':
        return new SmsForbiddenError(error.message);
      case 'UPSTREAM_UNAVAILABLE':
      case 'RATE_LIMITED':
      case 'INTERNAL_ERROR':
        return new SmsUpstreamError(error.message, error.code, error.requestId);
      default:
        return new SmsUpstreamError(error.message, error.code, error.requestId);
    }
  }

  getSnapshot(): Promise<SmsSettingsSnapshot> {
    return this.request<{ snapshot: SmsSettingsSnapshot }>('GET', SMS_SETTINGS_PATH).then((d) => d.snapshot);
  }

  update(payload: SmsSettingsUpdatePayload): Promise<SmsSettingsSnapshot> {
    return this.request<{ snapshot: SmsSettingsSnapshot }>('PUT', SMS_SETTINGS_PATH, payload).then((d) => d.snapshot);
  }

  rotateSecret(payload: SmsSettingsRotateSecretPayload): Promise<SmsSettingsSnapshot> {
    return this.request<{ snapshot: SmsSettingsSnapshot }>('POST', `${SMS_SETTINGS_PATH}/secret`, payload).then(
      (d) => d.snapshot,
    );
  }

  clearSecret(payload: SmsSettingsClearSecretPayload): Promise<SmsSettingsSnapshot> {
    return this.request<{ snapshot: SmsSettingsSnapshot }>('DELETE', `${SMS_SETTINGS_PATH}/secret`, payload).then(
      (d) => d.snapshot,
    );
  }

  testSend(payload: SmsSettingsTestSendPayload): Promise<SmsSendOutcome> {
    return this.request<SmsTestSendResponse['data']>('POST', `${SMS_SETTINGS_PATH}/test-send`, payload).then(
      (d) => d.outcome,
    );
  }

  validate(): Promise<SmsValidation> {
    return this.request<SmsValidateResponse['data']>('POST', `${SMS_SETTINGS_PATH}/validate`).then((d) => d.validation);
  }

  diagnostics(): Promise<SmsDiagnostics> {
    return this.request<SmsDiagnosticsResponse['data']>('GET', `${SMS_SETTINGS_PATH}/diagnostics`).then(
      (d) => d.diagnostics,
    );
  }
}