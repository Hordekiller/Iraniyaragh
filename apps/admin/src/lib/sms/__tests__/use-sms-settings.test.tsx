import { renderHook, waitFor, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import {
  SmsNetworkError,
  SmsSessionExpiredError,
  SmsSettingsError,
  SmsVersionConflictError,
  type SmsSettingsPort,
} from '../sms-settings-port';
import { SmsSettingsFixture } from '../sms-settings-fixture';
import { useSmsSettings } from '../use-sms-settings';

function wrapper({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
}

function delegateWithTestSend(testSend: SmsSettingsPort['testSend']): SmsSettingsPort {
  const fixture = new SmsSettingsFixture();
  return {
    getSnapshot: () => fixture.getSnapshot(),
    diagnostics: () => fixture.diagnostics(),
    update: (payload) => fixture.update(payload),
    rotateSecret: (payload) => fixture.rotateSecret(payload),
    clearSecret: (payload) => fixture.clearSecret(payload),
    validate: () => fixture.validate(),
    testSend,
  };
}

describe('useSmsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('loads the snapshot and diagnostics in parallel', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.snapshot?.version).toBe(3);
    expect(result.current.diagnostics?.circuitState).toBe('closed');
  });

  it('saves a patch against the loaded version and refreshes the snapshot', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.save({ templateId: 778899 }));
    await waitFor(() => expect(result.current.snapshot?.settings.templateId).toBe(778899));
    expect(result.current.snapshot?.version).toBe(4);
    expect(await screen.findByText('تنظیمات با موفقیت ذخیره شد.')).toBeInTheDocument();
  });

  it('handles a version conflict by reloading instead of losing the page', async () => {
    let externalVersion = 5;
    let externalEnabled = true;
    const service: SmsSettingsPort = {
      getSnapshot: async () => {
        const snapshot = await new SmsSettingsFixture().getSnapshot();
        return {
          ...snapshot,
          version: externalVersion,
          settings: { ...snapshot.settings, enabled: externalEnabled },
        };
      },
      diagnostics: async () => ({
        providerHealth: 'ok',
        circuitState: 'closed',
        lastSuccessfulSendAt: null,
        lastErrorClass: null,
      }),
      update: async ({ expectedVersion, patch }) => {
        if (expectedVersion !== externalVersion) throw new SmsVersionConflictError();
        externalVersion += 1;
        externalEnabled = patch.enabled ?? externalEnabled;
        const snapshot = await new SmsSettingsFixture().getSnapshot();
        return {
          ...snapshot,
          version: externalVersion,
          settings: { ...snapshot.settings, enabled: externalEnabled, ...patch },
        };
      },
      rotateSecret: async () => new SmsSettingsFixture().getSnapshot(),
      clearSecret: async () => new SmsSettingsFixture().getSnapshot(),
      testSend: async () => ({ messageId: 'm1', status: 'accepted' }),
      validate: async () => ({ checked: true, providerHealth: 'ok', lastCheckedAt: null, errorClass: null }),
    };

    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    // Another admin changed the settings after our load: version 6 enabled=false.
    act(() => {
      externalVersion = 6;
      externalEnabled = false;
    });

    act(() => result.current.save({ timeoutMs: 4000 }));

    await waitFor(() => expect(result.current.snapshot?.settings.enabled).toBe(false));
    expect(result.current.snapshot?.version).toBe(6);
    await expect(screen.findByText(/نمای تازه شد/)).resolves.toBeInTheDocument();
  });

  it('rotates the secret and reports the outcome through the feedback system', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.rotate('fresh-key'));
    await waitFor(() => expect(screen.findByText('کلید جدید اعمال شد.')).resolves.toBeInTheDocument());
    expect(result.current.snapshot?.secret.configured).toBe(true);
  });

  it('clears the secret and reports the outcome through the feedback system', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.clear());
    await waitFor(() => expect(screen.findByText('کلید پاک‌سازی شد.')).resolves.toBeInTheDocument());
    expect(result.current.snapshot?.secret.configured).toBe(false);
  });

  it('test-sends a message and stores the accepted outcome', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.testSend());
    await waitFor(() => expect(screen.findByText('پیام آزمایشی ارسال شد.')).resolves.toBeInTheDocument());
    expect(result.current.lastOutcome?.status).toBe('accepted');
  });

  it('validates the configuration and stores the result', async () => {
    const service = new SmsSettingsFixture();
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.validateNow());
    await waitFor(() => expect(screen.findByText('بررسی پیکربندی انجام شد.')).resolves.toBeInTheDocument());
    expect(result.current.lastValidation?.providerHealth).toBe('ok');
  });

  it('reuses the same idempotency key when retrying after a response loss', async () => {
    const receivedKeys: string[] = [];
    const service = delegateWithTestSend(async (payload) => {
      receivedKeys.push(payload.idempotencyKey);
      if (receivedKeys.length === 1) throw new SmsNetworkError('اتصال برقرار نشد.');
      return { messageId: 'm1', status: 'accepted' };
    });
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.testSend());
    await waitFor(() => expect(screen.findByText('اتصال برقرار نشد.')).resolves.toBeInTheDocument());
    await waitFor(() => expect(result.current.busy).toBeNull());
    await waitFor(() => expect(receivedKeys).toHaveLength(1));

    act(() => result.current.testSend());
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    await waitFor(() => expect(result.current.lastOutcome?.status).toBe('accepted'));
    expect(receivedKeys).toHaveLength(2);
    expect(receivedKeys[0]).toBe(receivedKeys[1]);
  });

  it('mints a fresh idempotency key for a deliberate new attempt after a terminal success', async () => {
    const receivedKeys: string[] = [];
    const service = delegateWithTestSend(async (payload) => {
      receivedKeys.push(payload.idempotencyKey);
      return { messageId: 'm1', status: 'accepted' };
    });
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.testSend());
    await waitFor(() => expect(screen.findByText('پیام آزمایشی ارسال شد.')).resolves.toBeInTheDocument());

    act(() => result.current.testSend());
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[0]).not.toBe(receivedKeys[1]);
  });

  it('treats unknown_result as terminal: warns without inviting a retry and closes the attempt', async () => {
    const receivedKeys: string[] = [];
    const service = delegateWithTestSend(async (payload) => {
      receivedKeys.push(payload.idempotencyKey);
      return { messageId: null, status: 'unknown_result' };
    });
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.testSend());
    await waitFor(() =>
      expect(screen.findByText(/نتیجهٔ ارسال نامشخص است/)).resolves.toBeInTheDocument(),
    );
    expect(screen.queryByText(/دوباره تلاش/)).not.toBeInTheDocument();

    act(() => result.current.testSend());
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[0]).not.toBe(receivedKeys[1]);
  });

  it('surfaces an expired session as an actionable state instead of only a toast', async () => {
    const fixture = new SmsSettingsFixture();
    const service: SmsSettingsPort = {
      getSnapshot: async () => {
        throw new SmsSessionExpiredError();
      },
      diagnostics: () => fixture.diagnostics(),
      update: (p) => fixture.update(p),
      rotateSecret: (p) => fixture.rotateSecret(p),
      clearSecret: (p) => fixture.clearSecret(p),
      testSend: (p) => fixture.testSend(p),
      validate: () => fixture.validate(),
    };
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });

    await waitFor(() => expect(result.current.requireReauth).toBe(true));
    expect(result.current.status).toBe('error');
  });

  it('clears the retry key after a definitive server error (not network)', async () => {
    const receivedKeys: string[] = [];
    const service = delegateWithTestSend(async (payload) => {
      receivedKeys.push(payload.idempotencyKey);
      if (receivedKeys.length === 1) throw new SmsSettingsError('provider', 'خطای ارائه‌دهنده.', 'PROVIDER');
      return { messageId: 'm1', status: 'accepted' };
    });
    const { result } = renderHook(() => useSmsSettings({ service }), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => result.current.testSend());
    await waitFor(() => expect(screen.findByText('خطای ارائه‌دهنده.')).resolves.toBeInTheDocument());

    act(() => result.current.testSend());
    await waitFor(() => expect(receivedKeys).toHaveLength(2));
    expect(receivedKeys[0]).not.toBe(receivedKeys[1]);
  });
});