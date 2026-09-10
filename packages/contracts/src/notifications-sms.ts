import type { ApiSuccess } from './api';

export type SmsProviderEnvironment = 'development' | 'production' | 'unknown';

export type SmsSendStatus = 'accepted' | 'rejected' | 'rate_limited' | 'unavailable' | 'unknown_result';

export type SmsSecretBackendCapability = 'writable' | 'read_only';

export type SmsAlertThresholds = {
  failureWindowMinutes: number;
  failureCount: number;
};

export type SmsSettingsEditableFields = {
  enabled: boolean;
  templateId: number | null;
  senderLine: string | null;
  timeoutMs: number;
  deliveryStatusEnabled: boolean;
  outageMode: boolean;
  maintenanceMessage: string | null;
  alertThresholds: SmsAlertThresholds | null;
};

export type SmsSettingsFields = SmsSettingsEditableFields & {
  environment: SmsProviderEnvironment;
};

export type SmsSecretStatus = {
  configured: boolean;
  masked: string | null;
  validated: boolean;
  lastRotatedAt: string | null;
};

export type SmsSettingsSnapshot = {
  version: number;
  updatedAt: string | null;
  settings: SmsSettingsFields;
  secret: SmsSecretStatus;
  secretBackend: SmsSecretBackendCapability;
};

export type SmsSettingsResponse = ApiSuccess<{ snapshot: SmsSettingsSnapshot }>;

export type SmsSettingsUpdatePayload = {
  expectedVersion: number;
  patch: Partial<SmsSettingsEditableFields>;
};

export type SmsSettingsRotateSecretPayload = {
  secret: string;
  confirm: boolean;
  idempotencyKey: string;
};

export type SmsSettingsClearSecretPayload = {
  confirm: boolean;
  idempotencyKey: string;
};

export type SmsSettingsTestSendPayload = {
  confirm: boolean;
  idempotencyKey: string;
};

export type SmsSendOutcome = {
  messageId: string | null;
  status: SmsSendStatus;
};

export type SmsTestSendResponse = ApiSuccess<{ outcome: SmsSendOutcome }>;

export type SmsValidation = {
  checked: boolean;
  providerHealth: SmsProviderHealth;
  lastCheckedAt: string | null;
  errorClass: SmsErrorClass | null;
};

export type SmsValidateResponse = ApiSuccess<{ validation: SmsValidation }>;

export type SmsProviderHealth = 'ok' | 'degraded' | 'down' | 'not_configured' | 'unknown';

export type SmsCircuitState = 'closed' | 'open' | 'half_open' | 'unknown';

export type SmsErrorClass = 'auth' | 'rate_limit' | 'invalid_request' | 'provider_error' | 'timeout' | 'not_configured';

export type SmsDiagnostics = {
  providerHealth: SmsProviderHealth;
  circuitState: SmsCircuitState;
  lastSuccessfulSendAt: string | null;
  lastErrorClass: SmsErrorClass | null;
};

export type SmsDiagnosticsResponse = ApiSuccess<{ diagnostics: SmsDiagnostics }>;