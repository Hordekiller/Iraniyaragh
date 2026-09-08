import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsSnapshot,
  SmsValidation,
} from '@iranyaragh/contracts';
import type { SmsSettingsStore } from './sms-settings.port';

const UNCONFIGURED_SNAPSHOT: SmsSettingsSnapshot = Object.freeze({
  version: 0,
  updatedAt: null,
  settings: {
    enabled: false,
    environment: 'unknown' as const,
    templateId: null,
    senderLine: null,
    timeoutMs: 5_000,
    deliveryStatusEnabled: false,
    outageMode: true,
    maintenanceMessage: null,
    alertThresholds: null,
  },
  secret: { configured: false, masked: null, validated: false, lastRotatedAt: null },
  secretBackend: 'read_only' as const,
});

const UNCONFIGURED_DIAGNOSTICS: SmsDiagnostics = Object.freeze({
  providerHealth: 'not_configured',
  circuitState: 'unknown',
  lastSuccessfulSendAt: null,
  lastErrorClass: 'not_configured',
});

function unavailable(): never {
  throw new ServiceUnavailableException({
    code: 'UPSTREAM_UNAVAILABLE',
    message: 'SMS provider settings are not configured by an active provider adapter.',
  });
}

function unsupportedOnReadOnly(): never {
  throw new UnprocessableEntityException({
    code: 'OPERATION_UNSUPPORTED',
    message: 'Secret rotation and clearing are unavailable for the read-only environment-backed secret store.',
  });
}

export class DisconnectedSmsSettingsStore implements SmsSettingsStore {
  async read(): Promise<SmsSettingsSnapshot> {
    return UNCONFIGURED_SNAPSHOT;
  }

  async update(): Promise<SmsSettingsSnapshot> {
    return unavailable();
  }

  async rotateSecret(): Promise<{ lastRotatedAt: string }> {
    return unsupportedOnReadOnly();
  }

  async clearSecret(): Promise<{ clearedAt: string }> {
    return unsupportedOnReadOnly();
  }

  async submitTestSend(): Promise<SmsSendOutcome> {
    return unavailable();
  }

  async validateConfiguration(): Promise<SmsValidation> {
    return unavailable();
  }

  async diagnostics(): Promise<SmsDiagnostics> {
    return UNCONFIGURED_DIAGNOSTICS;
  }
}