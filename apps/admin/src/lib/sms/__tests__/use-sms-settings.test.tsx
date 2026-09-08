import { renderHook, waitFor, act, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import { SmsVersionConflictError, type SmsSettingsPort } from '../sms-settings-port';
import { SmsSettingsFixture } from '../sms-settings-fixture';
import { useSmsSettings } from '../use-sms-settings';

function wrapper({ children }: { children: ReactNode }) {
  return <FeedbackProvider>{children}</FeedbackProvider>;
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
});