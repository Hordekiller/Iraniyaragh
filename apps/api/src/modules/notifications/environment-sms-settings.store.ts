import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SmsDiagnostics, SmsSendOutcome, SmsSettingsSnapshot, SmsValidation } from '@iranyaragh/contracts';
import type { SmsSettingsStore } from './sms-settings.port';

const FIXED_SECRET_MASK = '••••••••';

function unsupported(message: string): never {
  throw new UnprocessableEntityException({ code: 'OPERATION_UNSUPPORTED', message });
}

/**
 * Truthful read-only projection of process/deployment configuration.
 *
 * Environment variables are snapshotted during bootstrap. Admin operations can
 * inspect safe status, but can never pretend to mutate process.env or send to an
 * arbitrary destination. A writable store can replace this implementation only
 * after an approved secret-manager/persistence decision.
 */
export class EnvironmentSmsSettingsStore implements SmsSettingsStore {
  private readonly snapshot: SmsSettingsSnapshot;

  constructor(config: ConfigService) {
    const nodeEnvironment = config.get<string>('NODE_ENV') ?? 'development';
    const productionLike = nodeEnvironment === 'production' || nodeEnvironment === 'staging';
    const apiKey = config.get<string>('SMS_IR_API_KEY');
    const templateId = config.get<number>('SMS_IR_OTP_TEMPLATE_ID');
    const timeoutMs = config.get<number>('SMS_IR_TIMEOUT_MS') ?? 5_000;
    const configured = productionLike && typeof apiKey === 'string' && apiKey.length > 0 && templateId !== undefined;

    this.snapshot = Object.freeze({
      version: 1,
      updatedAt: null,
      settings: Object.freeze({
        enabled: configured,
        environment: productionLike ? 'production' : 'development',
        templateId: configured ? templateId : null,
        senderLine: null,
        timeoutMs,
        deliveryStatusEnabled: false,
        outageMode: !configured,
        maintenanceMessage: null,
        alertThresholds: null,
      }),
      secret: Object.freeze({
        configured,
        masked: configured ? FIXED_SECRET_MASK : null,
        validated: false,
        lastRotatedAt: null,
      }),
      secretBackend: 'read_only',
    });
  }

  async read(): Promise<SmsSettingsSnapshot> {
    return this.snapshot;
  }

  async update(): Promise<SmsSettingsSnapshot> {
    return unsupported('SMS settings are read-only while deployment environment configuration is active.');
  }

  async rotateSecret(): Promise<{ lastRotatedAt: string }> {
    return unsupported('Secret rotation is unavailable for the read-only environment-backed store.');
  }

  async clearSecret(): Promise<{ clearedAt: string }> {
    return unsupported('Secret clearing is unavailable for the read-only environment-backed store.');
  }

  async submitTestSend(): Promise<SmsSendOutcome> {
    throw new ServiceUnavailableException({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Controlled SMS test send requires a privately configured approved operator destination.',
    });
  }

  async validateConfiguration(): Promise<SmsValidation> {
    const configured = this.snapshot.secret.configured && this.snapshot.settings.templateId !== null;
    return {
      checked: true,
      providerHealth: configured ? 'unknown' : 'not_configured',
      lastCheckedAt: new Date().toISOString(),
      errorClass: configured ? null : 'not_configured',
    };
  }

  async diagnostics(): Promise<SmsDiagnostics> {
    const configured = this.snapshot.secret.configured && this.snapshot.settings.templateId !== null;
    return {
      providerHealth: configured ? 'unknown' : 'not_configured',
      circuitState: 'unknown',
      lastSuccessfulSendAt: null,
      lastErrorClass: configured ? null : 'not_configured',
    };
  }
}
