import type {
  SmsDiagnosticsResponse,
  SmsSettingsResponse,
  SmsTestSendResponse,
  SmsValidateResponse,
} from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { NotificationsAdminController } from './notifications.admin.controller';
import type { SmsSettingsService } from './sms-settings.service';

const principal: AuthPrincipalContext = Object.freeze({
  userId: 'staff-1',
  sessionId: 'session-staff-1',
  tokenId: 'jti-staff-1',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['settings.manage']),
});

function createController() {
  const settings = {
    getSettings: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    updateSettings: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    rotateSecret: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    clearSecret: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    validateConfiguration: vi.fn(async (): Promise<SmsValidateResponse> => ({ data: { validation: {} as never } })),
    sendControlledTest: vi.fn(async (): Promise<SmsTestSendResponse> => ({ data: { outcome: {} as never } })),
    getDiagnostics: vi.fn(async (): Promise<SmsDiagnosticsResponse> => ({ data: { diagnostics: {} as never } })),
  };
  const controller = new NotificationsAdminController(settings as unknown as SmsSettingsService);
  return { settings, controller };
}

describe('NotificationsAdminController', () => {
  let ctx: ReturnType<typeof createController>;

  beforeEach(() => {
    ctx = createController();
  });

  it('delegates every admin surface to the settings service', async () => {
    await ctx.controller.getSettings();
    await ctx.controller.updateSettings(principal as never, { expectedVersion: 1, patch: {} } as never);
    await ctx.controller.rotateSecret(principal as never, { secret: 'k', confirm: true } as never);
    await ctx.controller.clearSecret(principal as never, { confirm: true } as never);
    await ctx.controller.validateConfiguration(principal as never);
    await ctx.controller.sendControlledTest(principal as never, { confirm: true } as never);
    await ctx.controller.getDiagnostics();

    expect(ctx.settings.getSettings).toHaveBeenCalledOnce();
    expect(ctx.settings.updateSettings).toHaveBeenCalledOnce();
    expect(ctx.settings.rotateSecret).toHaveBeenCalledOnce();
    expect(ctx.settings.clearSecret).toHaveBeenCalledOnce();
    expect(ctx.settings.validateConfiguration).toHaveBeenCalledOnce();
    expect(ctx.settings.sendControlledTest).toHaveBeenCalledOnce();
    expect(ctx.settings.getDiagnostics).toHaveBeenCalledOnce();
  });

  it('passes the acting principal and wires the update payload', async () => {
    await ctx.controller.updateSettings(principal as never, { expectedVersion: 2, patch: { timeoutMs: 3000 } } as never);
    await ctx.controller.rotateSecret(
      principal as never,
      { secret: 'k', confirm: true, idempotencyKey: 'rotate-1' } as never,
    );
    await ctx.controller.clearSecret(principal as never, { confirm: true, idempotencyKey: 'clear-1' } as never);
    await ctx.controller.sendControlledTest(principal as never, { confirm: true, idempotencyKey: 'test-1' } as never);

    expect(ctx.settings.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'staff-1', requestId: expect.any(String) }),
      expect.objectContaining({ expectedVersion: 2, patch: expect.objectContaining({ timeoutMs: 3000 }) }),
    );
    expect(ctx.settings.rotateSecret).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'staff-1', requestId: expect.any(String) }),
      expect.objectContaining({ secret: 'k', confirm: true, idempotencyKey: 'rotate-1' }),
    );
    expect(ctx.settings.clearSecret).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'staff-1' }),
      expect.objectContaining({ confirm: true, idempotencyKey: 'clear-1' }),
    );
    expect(ctx.settings.sendControlledTest).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'staff-1' }),
      expect.objectContaining({ confirm: true, idempotencyKey: 'test-1' }),
    );
  });

  it('validates configuration under the acting principal', async () => {
    await ctx.controller.validateConfiguration(principal as never);
    expect(ctx.settings.validateConfiguration).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: 'staff-1', requestId: expect.any(String) }),
    );
  });
});