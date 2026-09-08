import type { SmsDiagnosticsResponse, SmsSettingsResponse, SmsTestSendResponse } from '@iranyaragh/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipalContext } from '../auth/auth-principal.service';
import { SmsSettingsController } from './sms-settings.controller';
import type { SmsSettingsAdminService } from './sms-settings.service';

const principal: AuthPrincipalContext = Object.freeze({
  userId: 'staff-1',
  sessionId: 'session-staff-1',
  tokenId: 'jti-staff-1',
  authenticationLevel: 'STAFF_MFA',
  authenticatedAt: new Date(Date.now() - 30_000),
  accessExpiresAt: new Date(Date.now() + 600_000),
  permissions: new Set(['sms-settings.manage']),
});

function createController() {
  const admin = {
    read: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    update: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    rotateSecret: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    clearSecret: vi.fn(async (): Promise<SmsSettingsResponse> => ({ data: { snapshot: {} as never } })),
    testSend: vi.fn(async (): Promise<SmsTestSendResponse> => ({ data: { outcome: {} as never } })),
    diagnostics: vi.fn(async (): Promise<SmsDiagnosticsResponse> => ({ data: { diagnostics: {} as never } })),
  };
  const controller = new SmsSettingsController(admin as unknown as SmsSettingsAdminService);
  return { admin, controller };
}

describe('SmsSettingsController', () => {
  let ctx: ReturnType<typeof createController>;

  beforeEach(() => {
    ctx = createController();
  });

  it('delegates every admin surface to the settings service', async () => {
    await ctx.controller.getSettings();
    await ctx.controller.updateSettings(principal as never, {} as never);
    await ctx.controller.rotateSecret(principal as never, {} as never);
    await ctx.controller.clearSecret(principal as never);
    await ctx.controller.testSend(principal as never, {} as never);
    await ctx.controller.diagnostics();

    expect(ctx.admin.read).toHaveBeenCalledOnce();
    expect(ctx.admin.update).toHaveBeenCalledOnce();
    expect(ctx.admin.rotateSecret).toHaveBeenCalledOnce();
    expect(ctx.admin.clearSecret).toHaveBeenCalledOnce();
    expect(ctx.admin.testSend).toHaveBeenCalledOnce();
    expect(ctx.admin.diagnostics).toHaveBeenCalledOnce();
  });

  it('passes the acting principal to mutating operations', async () => {
    await ctx.controller.updateSettings(principal as never, { timeoutMs: 3000 } as never);
    await ctx.controller.rotateSecret(principal as never, { apiKey: 'k', confirm: true } as never);
    await ctx.controller.clearSecret(principal as never);

    expect(ctx.admin.update).toHaveBeenCalledWith('staff-1', { timeoutMs: 3000 });
    expect(ctx.admin.rotateSecret).toHaveBeenCalledWith('staff-1', { apiKey: 'k', confirm: true });
    expect(ctx.admin.clearSecret).toHaveBeenCalledWith('staff-1');
  });
});