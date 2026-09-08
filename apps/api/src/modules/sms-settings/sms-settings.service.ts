import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type {
  SmsDiagnosticsResponse,
  SmsSettingsResponse,
  SmsTestSendResponse,
} from '@iranyaragh/contracts';
import { getRequestId } from '../../common/request-context';
import { AuditLogService } from '../audit/audit-log.service';
import type { SmsSettingsRotateSecretDto, SmsSettingsTestSendDto, SmsSettingsUpdateDto } from './sms-settings.dto';
import type { SmsSettingsStore } from './sms-settings.port';

const CLEAR_TO_NULL = new Set(['templateId', 'senderLine', 'maintenanceMessage'] as const);

type ClearedField = 'templateId' | 'senderLine' | 'maintenanceMessage';

function sanitize(input: SmsSettingsUpdateDto): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    clean[key] = CLEAR_TO_NULL.has(key as ClearedField) && value === '' ? null : value;
  }
  return clean;
}

@Injectable()
export class SmsSettingsAdminService {
  constructor(
    private readonly store: SmsSettingsStore,
    private readonly audit: AuditLogService,
  ) {}

  async read(): Promise<SmsSettingsResponse> {
    const snapshot = await this.store.read();
    return { data: { snapshot } };
  }

  async update(actorId: string, input: SmsSettingsUpdateDto): Promise<SmsSettingsResponse> {
    const clean = sanitize(input);
    const snapshot = await this.store.update(clean);
    await this.audit.record({
      actorId,
      action: 'sms-settings.updated',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: getRequestId(),
      after: { fields: Object.keys(clean) },
    });
    return { data: { snapshot } };
  }

  async rotateSecret(actorId: string, input: SmsSettingsRotateSecretDto): Promise<SmsSettingsResponse> {
    if (input.confirm !== true) {
      throw new UnprocessableEntityException({
        code: 'UNPROCESSABLE',
        message: 'Explicit confirmation is required to rotate the SMS provider secret.',
      });
    }
    const { lastRotatedAt } = await this.store.rotateSecret(input.apiKey);
    const snapshot = await this.store.read();
    await this.audit.record({
      actorId,
      action: 'sms-settings.secret.rotated',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: getRequestId(),
      after: { lastRotatedAt },
    });
    return { data: { snapshot } };
  }

  async clearSecret(actorId: string): Promise<SmsSettingsResponse> {
    const { clearedAt } = await this.store.clearSecret();
    const snapshot = await this.store.read();
    await this.audit.record({
      actorId,
      action: 'sms-settings.secret.cleared',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: getRequestId(),
      after: { clearedAt },
    });
    return { data: { snapshot } };
  }

  async testSend(actorId: string, input: SmsSettingsTestSendDto): Promise<SmsTestSendResponse> {
    const outcome = await this.store.submitTestSend(input.parameters ?? {});
    await this.audit.record({
      actorId,
      action: 'sms-settings.test-send',
      entityType: 'SmsSettings',
      entityId: null,
      requestId: getRequestId(),
      after: { status: outcome.status, accepted: outcome.accepted },
    });
    return { data: { outcome } };
  }

  async diagnostics(): Promise<SmsDiagnosticsResponse> {
    const diagnostics = await this.store.diagnostics();
    return { data: { diagnostics } };
  }
}