import { UnprocessableEntityException } from '@nestjs/common';
import type { SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmsSettingsStore } from './sms-settings.port';
import { SmsSettingsAdminService } from './sms-settings.service';

const DEFAULT_SNAPSHOT: SmsSettingsSnapshot = {
  version: 3,
  updatedAt: '2026-09-08T00:00:00.000Z',
  settings: {
    enabled: true,
    environment: 'production',
    templateId: 'verify-code',
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
};

function createFakeStore(initial: SmsSettingsSnapshot = DEFAULT_SNAPSHOT) {
  let state = initial;
  const store = {
    read: vi.fn(async () => state),
    update: vi.fn(async (input: Record<string, unknown>) => {
      state = {
        ...state,
        version: state.version + 1,
        settings: { ...state.settings, ...(input as Partial<typeof state.settings>) },
      };
      return state;
    }),
    rotateSecret: vi.fn(async (apiKey: string) => ({ lastRotatedAt: apiKey.length > 0 ? '2026-09-08T10:00:00.000Z' : '' })),
    clearSecret: vi.fn(async () => ({ clearedAt: '2026-09-08T10:00:00.000Z' })),
    submitTestSend: vi.fn(async () => ({ messageId: 'msg-1', accepted: true, status: 'accepted' as const })),
    diagnostics: vi.fn(async () => ({
      providerHealth: 'ok' as const,
      circuitState: 'closed' as const,
      lastSuccessfulSendAt: '2026-09-08T09:00:00.000Z',
      lastErrorClass: null,
    })),
  };
  return { store: store as unknown as SmsSettingsStore, mutate: () => state };
}

function build() {
  const { store, mutate } = createFakeStore();
  const audit = { record: vi.fn(async () => undefined) };
  const service = new SmsSettingsAdminService(store, audit);
  return { service, store, audit, mutate };
}

describe('SmsSettingsAdminService', () => {
  let ctx: ReturnType<typeof build>;

  beforeEach(() => {
    ctx = build();
  });

  it('reads a snapshot that never exposes the raw secret', async () => {
    const response = await ctx.service.read();
    const raw = JSON.stringify(response);
    expect(raw).not.toContain('0123456789abcdef');
    expect(raw).toContain('••••');
    expect(ctx.store.read).toHaveBeenCalledOnce();
  });

  it('sanitizes empty strings to null before updating the store', async () => {
    await ctx.service.update('actor-1', { templateId: '', senderLine: '30007221' });
    expect(ctx.store.update).toHaveBeenCalledWith({ templateId: null, senderLine: '30007221' });
  });

  it('records an audit entry with changed field names only', async () => {
    await ctx.service.update('actor-1', { timeoutMs: 3_000 });
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'actor-1',
        action: 'sms-settings.updated',
        entityType: 'SmsSettings',
        after: { fields: ['timeoutMs'] },
      }),
    );
  });

  it('requires explicit confirmation to rotate the secret', async () => {
    await expect(ctx.service.rotateSecret('actor-1', { apiKey: '0123456789abcdef', confirm: false })).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(ctx.store.rotateSecret).not.toHaveBeenCalled();
  });

  it('rotates, re-reads and audits without returning the secret', async () => {
    const response = await ctx.service.rotateSecret('actor-1', { apiKey: '0123456789abcdef', confirm: true });
    expect(ctx.store.rotateSecret).toHaveBeenCalledWith('0123456789abcdef');
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.secret.rotated' }));
    expect(JSON.stringify(response)).not.toContain('0123456789abcdef');
  });

  it('clears the secret and records an audit event', async () => {
    await ctx.service.clearSecret('actor-1');
    expect(ctx.store.clearSecret).toHaveBeenCalledOnce();
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.secret.cleared' }));
  });

  it('passes only template parameters to a test send and audits the outcome', async () => {
    const response = await ctx.service.testSend('actor-1', { parameters: { Code: '654321' } });
    expect(ctx.store.submitTestSend).toHaveBeenCalledWith({ Code: '654321' });
    expect(ctx.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'sms-settings.test-send' }));
    expect(response.data.outcome.status).toBe('accepted');
  });

  it('returns diagnostics verbatim from the store', async () => {
    const response = await ctx.service.diagnostics();
    expect(response.data.diagnostics.providerHealth).toBe('ok');
    expect(response.data.diagnostics.circuitState).toBe('closed');
  });
});