import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SmsDiagnostics, SmsSendOutcome, SmsSettingsSnapshot, SmsValidation } from '@iranyaragh/contracts';
import type { SmsTemplateSettingsService } from './sms-template-settings.service';
import type { SmsProvider } from './sms-provider';
import type { SmsOperatorTestService } from './sms-operator-test.service';
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

  private lastValidation: SmsValidation | null = null;

  constructor(config: ConfigService, private readonly provider?: SmsProvider,
    private readonly operatorTest?: Pick<SmsOperatorTestService, 'send'> & Partial<Pick<SmsOperatorTestService, 'lastAcceptedAt'>>,
    private readonly templateSettings?: Pick<SmsTemplateSettingsService, 'read'>) {
    const nodeEnvironment = config.get<string>('NODE_ENV') ?? 'development';
    const productionLike = nodeEnvironment === 'production' || nodeEnvironment === 'staging';
    const apiKey = config.get<string>('SMS_IR_API_KEY');
    const templateId = config.get<number>('SMS_IR_OTP_TEMPLATE_ID');
    const timeoutMs = config.get<number>('SMS_IR_TIMEOUT_MS') ?? 5_000;
    const active = productionLike && config.get<string>('SMS_PROVIDER_MODE') !== 'disabled';
    const configured = productionLike && typeof apiKey === 'string' && apiKey.length > 0;

    this.snapshot = Object.freeze({
      templates: Object.freeze({ otp: templateId !== undefined,
        orderPaid: config.get('SMS_IR_ORDER_PAID_TEMPLATE_ID') !== undefined,
        shipmentDispatched: config.get('SMS_IR_SHIPMENT_DISPATCHED_TEMPLATE_ID') !== undefined,
        shipmentDelivered: config.get('SMS_IR_SHIPMENT_DELIVERED_TEMPLATE_ID') !== undefined }),
      version: 1,
      updatedAt: null,
      settings: Object.freeze({
        enabled: active && configured,
        environment: productionLike ? 'production' : 'development',
        templateId: configured ? templateId ?? null : null,
        senderLine: null,
        timeoutMs,
        deliveryStatusEnabled: false,
        outageMode: !active || !configured,
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
    const stored = this.templateSettings && this.snapshot.settings.environment === 'production'
      ? await this.templateSettings.read() : null;
    const templates = stored ? { otp: stored.otpTemplateId !== null, orderPaid: stored.orderPaidTemplateId !== null,
      shipmentDispatched: stored.shipmentDispatchedTemplateId !== null, shipmentDelivered: stored.shipmentDeliveredTemplateId !== null }
      : this.snapshot.templates;
    const enabled = this.snapshot.settings.enabled && (!stored || Object.values(templates ?? {}).every(Boolean));
    return { ...this.snapshot, templates,
      settings: { ...this.snapshot.settings, enabled, outageMode: !enabled,
        templateId: stored ? stored.otpTemplateId : this.snapshot.settings.templateId },
      secret: { ...this.snapshot.secret, validated: this.lastValidation?.providerHealth === 'ok' } };
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

  async submitTestSend(idempotencyKey: string, requestId: string): Promise<SmsSendOutcome> {
    if (this.operatorTest && (await this.read()).settings.enabled)
      return this.operatorTest.send(idempotencyKey, requestId);
    throw new ServiceUnavailableException({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Controlled SMS test send requires a privately configured approved operator destination.',
    });
  }

  async validateConfiguration(): Promise<SmsValidation> {
    const snapshot = await this.read();
    if (!snapshot.settings.enabled || !this.provider?.checkHealth) {
      return { checked: false, providerHealth: snapshot.settings.enabled ? 'unknown' : 'not_configured',
        lastCheckedAt: null, errorClass: snapshot.settings.enabled ? null : 'not_configured' };
    }
    try {
      this.lastValidation = await this.provider.checkHealth();
    } catch {
      this.lastValidation = { checked: true, providerHealth: 'unknown', errorClass: 'provider_error',
        lastCheckedAt: new Date().toISOString() };
    }
    return this.lastValidation;
  }

  async diagnostics(): Promise<SmsDiagnostics> {
    const snapshot = await this.read();
    return {
      providerHealth: snapshot.settings.enabled ? this.lastValidation?.providerHealth ?? 'unknown' : 'not_configured',
      circuitState: 'unknown',
      lastSuccessfulSendAt: await this.operatorTest?.lastAcceptedAt?.() ?? null,
      lastErrorClass: snapshot.settings.enabled ? this.lastValidation?.errorClass ?? null : 'not_configured',
    };
  }
}
