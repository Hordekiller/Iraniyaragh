import {
  ConflictException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisconnectedSmsSettingsStore } from './sms-settings.disconnected';
import type { SmsSettingsStore } from './sms-settings.port';
import { SmsSettingsService } from './sms-settings.service';

const DELTA_KEY = 'rotate-2026-09-08-a1';

const DEFAULT_SNAPSHOT: SmsSettingsSnapshot = {
  version: 3,
  updatedAt: '2026-09-08T00:00:00.000Z',
  settings: {
    enabled: true,
    environment: 'production',
    templateId: 1_000_001,
    senderLine: '30007220',
    timeoutMs: 5_000,
    deliveryStatusEnabled: true,
    outageMode: false,
    maintenanceMessage: null,
    alertThresholds: { failureWindowMinutes: 15, failureCount: 5 },
  },
  secret: {
    configured: true,
    masked: '••••••••1234',
    validated: true,
    lastRotatedAt: '2026-09-01T00:00:00.000Z',
  },
  secretBackend: 'writable',
};

function createFakeStore(snapshot: SmsSettingsSnapshot = DEFAULT_SNAPSHOT) {
  let state = snapshot;
  const store = {
    read: vi.fn(async () => state),
    update: vi.fn(async (input: { expectedVersion: number; patch: Record<string, unknown> }) => {
      if (input.expectedVersion !== state.version) {
        throw new ConflictException({ code: 'CONFLICT', message: 'Sms settings changed concurrently.' });
      }
      state = {
        ...state,
        version: state.version + 1,
        settings: { ...state.settings, ...(input.patch as Partial<typeof state.settings>) },
      };
      return state;
    }),
    rotateSecret: vi.fn(async () => ({ lastRotatedAt: '2026-09-08T10:00:00.000Z' })),
    clearSecret: vi.fn(async () => ({ clearedAt: '2026-09-08T10:00:00.000Z' })),
    submitTestSend: vi.fn(async () => ({ messageId: 'msg-1', status: 'accepted' as const })),
    validateConfiguration: vi.fn(async () => ({
      checked: true,
      providerHealth: 'ok' as const,
      lastCheckedAt: '2026-09-08T09:30:00.000Z',
      errorClass: null,
    })),
    diagnostics: vi.fn(async () => ({
      providerHealth: 'ok' as const,
      circuitState: 'closed' as const,
      lastSuccessfulSendAt: '2026-09-08T09:00:00.000Z',
      lastErrorClass: null,
    })),
  };
  return { store: store as unknown as SmsSettingsStore, mutate: (next: SmsSettingsSnapshot) => (state = next) };
}

function build(snapshot?: SmsSettingsSnapshot) {
  const { store, mutate } = createFakeStore(snapshot);
  const audit = { record: vi.fn(async () => undefined) };
  const service = new SmsSettingsService(store as unknown as SmsSettingsStore, audit as never);
  const ctx = { actorUserId: 'actor-1', requestId: 'req-1' };
  return { service, store, audit, ctx, mutate };
}

describe('SmsSettingsService', () => {
  let b: ReturnType<typeof build>;

  beforeEach(() => {
    b = build();
  });

  it('reads a snapshot that never exposes the raw secret', async () => {
    const response = await b.service.getSettings();
    const raw = JSON.stringify(response);
    expect(raw).not.toContain('0123456789abcdef');
    expect(raw).toContain('••••');
    expect(b.store.read).toHaveBeenCalledOnce();
  });

  it('reports the secret status surface', async () => {
    const response = await b.service.getSecretStatus();
    expect(response.data.snapshot.secret.configured).toBe(true);
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
  });

  it('passes expectedVersion and the patch through to the store', async () => {
    await b.service.updateSettings(b.ctx, { expectedVersion: 3, patch: { enabled: false, timeoutMs: 3_000 } });
    expect(b.store.update).toHaveBeenCalledWith(
      { expectedVersion: 3, patch: { enabled: false, timeoutMs: 3_000 } },
      'req-1',
    );
  });

  it('normalizes empty clearable fields to null and drops unknown fields', async () => {
    await b.service.updateSettings(b.ctx, {
      expectedVersion: 3,
      patch: { senderLine: '', maintenanceMessage: '', environment: 'production' } as never,
    });
    expect(b.store.update).toHaveBeenCalledWith(
      { expectedVersion: 3, patch: { senderLine: null, maintenanceMessage: null } },
      'req-1',
    );
  });

  it('records an audit entry with changed field names only', async () => {
    await b.service.updateSettings(b.ctx, { expectedVersion: 3, patch: { timeoutMs: 3_000 } });
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'sms-settings.updated',
        entityType: 'SmsSettings',
        requestId: 'req-1',
        after: { fields: ['timeoutMs'], expectedVersion: 3 },
      }),
    );
  });

  it('propagates a stable conflict envelope for stale optimistic updates', async () => {
    await expect(b.service.updateSettings(b.ctx, { expectedVersion: 2, patch: { enabled: false } })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires explicit confirmation to rotate the secret', async () => {
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: false, idempotencyKey: DELTA_KEY }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(b.store.rotateSecret).not.toHaveBeenCalled();
  });

  it('rotates with the idempotency key and audits without returning the secret', async () => {
    const response = await b.service.rotateSecret(b.ctx, {
      secret: '0123456789abcdef',
      confirm: true,
      idempotencyKey: DELTA_KEY,
    });
    expect(b.store.rotateSecret).toHaveBeenCalledWith('0123456789abcdef', DELTA_KEY, 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.secret.rotated' }));
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
  });

  it('rejects rotation and clearing on a read-only environment-backed secret store', async () => {
    b.mutate({ ...DEFAULT_SNAPSHOT, secretBackend: 'read_only' });
    await expect(
      b.service.rotateSecret(b.ctx, { secret: '0123456789abcdef', confirm: true, idempotencyKey: DELTA_KEY }),
    ).rejects.toMatchObject({ response: { code: 'OPERATION_UNSUPPORTED' } });
    await expect(b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-1' })).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    expect(b.store.rotateSecret).not.toHaveBeenCalled();
    expect(b.store.clearSecret).not.toHaveBeenCalled();
  });

  it('clears the secret with the idempotency key and records an audit event', async () => {
    await b.service.clearSecret(b.ctx, { confirm: true, idempotencyKey: 'clear-1' });
    expect(b.store.clearSecret).toHaveBeenCalledWith('clear-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.secret.cleared' }));
  });

  it('validates configuration and audits attempt and outcome only', async () => {
    const response = await b.service.validateConfiguration(b.ctx);
    expect(b.store.validateConfiguration).toHaveBeenCalledWith('req-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sms-settings.validated', after: { checked: true, providerHealth: 'ok' } }),
    );
    expect(response.data.validation.checked).toBe(true);
  });

  it('requires explicit confirmation for a controlled test send and never forwards destination input', async () => {
    await expect(
      b.service.sendControlledTest(b.ctx, { confirm: false, idempotencyKey: 'test-1' }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);

    const response = await b.service.sendControlledTest(b.ctx, { confirm: true, idempotencyKey: 'test-1' });
    expect(b.store.submitTestSend).toHaveBeenCalledWith('test-1', 'req-1');
    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'sms-settings.test-send', after: { status: 'accepted', messageId: 'msg-1' } }),
    );
    expect(response.data.outcome.status).toBe('accepted');
  });

  it('returns diagnostics verbatim from the store', async () => {
    const response = await b.service.getDiagnostics();
    expect(response.data.diagnostics.providerHealth).toBe('ok');
    expect(response.data.diagnostics.circuitState).toBe('closed');
  });
});

describe('DisconnectedSmsSettingsStore', () => {
  it('reports an unconfigured snapshot that never claims a production environment', async () => {
    const store = new DisconnectedSmsSettingsStore();
    const snapshot = await store.read();
    expect(snapshot.settings.environment).toBe('unknown');
    expect(snapshot.secretBackend).toBe('read_only');
    expect(snapshot.secret.configured).toBe(false);
  });

  it('fails closed: rotation and clearing are unsupported, other operations are unavailable', async () => {
    const store = new DisconnectedSmsSettingsStore();
    await expect(store.rotateSecret('0123456789abcdef', DELTA_KEY, 'req-1')).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    await expect(store.clearSecret('clear-1', 'req-1')).rejects.toMatchObject({
      response: { code: 'OPERATION_UNSUPPORTED' },
    });
    await expect(store.update({ expectedVersion: 0, patch: { enabled: true } }, 'req-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(store.submitTestSend('test-1', 'req-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(store.validateConfiguration('req-1', 'req-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('serves read-only diagnostics without raising', async () => {
    const store = new DisconnectedSmsSettingsStore();
    const diagnostics = await store.diagnostics();
    expect(diagnostics.providerHealth).toBe('not_configured');
  });
});