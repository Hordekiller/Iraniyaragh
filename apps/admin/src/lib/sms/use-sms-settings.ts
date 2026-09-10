'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SmsDiagnostics,
  SmsSendOutcome,
  SmsSettingsSnapshot,
  SmsSettingsUpdatePayload,
  SmsValidation,
} from '@iranyaragh/contracts';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import {
  SmsNetworkError,
  SmsReauthenticationRequiredError,
  SmsSessionExpiredError,
  SmsSettingsError,
  SmsVersionConflictError,
  type SmsSettingsPort,
} from './sms-settings-port';

export type SmsPageStatus = 'loading' | 'ready' | 'error';

export type SmsActionKey = 'save' | 'rotate' | 'clear' | 'test' | 'validate' | null;

export type UseSmsSettingsOptions = {
  service: SmsSettingsPort;
};

function makeIdempotencyKey(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    return `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function friendlyMessage(error: unknown): string {
  if (error instanceof SmsVersionConflictError) {
    return 'تنظیمات در جای دیگر تغییر کرده است؛ نمای تازه شد. تغییرات خود را دوباره اعمال کنید.';
  }
  if (error instanceof SmsSettingsError) {
    return error.message;
  }
  return 'خطای غیرمنتظره سامانه.';
}

/**
 * Client page-model for the SMS settings panel. Loads the snapshot + diagnostics
 * in parallel, then exposes mutation actions that keep the snapshot fresh and
 * report outcomes through the feedback provider. Version conflicts trigger an
 * automatic reload so the user edits against the newest revision.
 *
 * Idempotency keys are per logical attempt: the key is minted when a mutation
 * starts and is REUSED on retries after a response loss (network error), so the
 * backend can dedupe without creating a second external effect. Any terminal
 * result — success, a definitive server error, or an `unknown_result` test-send
 * answer — closes the logical attempt so a deliberate fresh operation always
 * mints a new key.
 */
export function useSmsSettings({ service }: UseSmsSettingsOptions) {
  const feedback = useFeedback();
  const [status, setStatus] = useState<SmsPageStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<SmsSettingsSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<SmsDiagnostics | null>(null);
  const [lastValidation, setLastValidation] = useState<SmsValidation | null>(null);
  const [lastOutcome, setLastOutcome] = useState<SmsSendOutcome | null>(null);
  const [busy, setBusy] = useState<SmsActionKey>(null);
  const [requireReauth, setRequireReauth] = useState(false);
  const inFlight = useRef<SmsActionKey>(null);
  const pendingAttempt = useRef<{ key: Exclude<SmsActionKey, null>; idempotencyKey: string } | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    try {
      const [nextSnapshot, nextDiagnostics] = await Promise.all([
        service.getSnapshot(),
        service.diagnostics(),
      ]);
      setSnapshot(nextSnapshot);
      setDiagnostics(nextDiagnostics);
      setStatus('ready');
    } catch (error) {
      if (error instanceof SmsSessionExpiredError || error instanceof SmsReauthenticationRequiredError) {
        setRequireReauth(true);
        setStatus('error');
        setLoadError(friendlyMessage(error));
        return;
      }
      setLoadError(friendlyMessage(error));
      setStatus('error');
    }
  }, [service]);

  useEffect(() => {
    void load();
  }, [load]);

  const beginIdempotencyKey = useCallback((key: Exclude<SmsActionKey, null>): string => {
    if (pendingAttempt.current?.key === key) return pendingAttempt.current.idempotencyKey;
    const idempotencyKey = makeIdempotencyKey();
    pendingAttempt.current = { key, idempotencyKey };
    return idempotencyKey;
  }, []);

  const endIdempotencyKey = useCallback(() => {
    pendingAttempt.current = null;
  }, []);

  const run = useCallback(
    async (key: Exclude<SmsActionKey, null>, action: (idempotencyKey: string) => Promise<void>) => {
      if (inFlight.current !== null) return;
      inFlight.current = key;
      setBusy(key);
      const idempotencyKey = beginIdempotencyKey(key);
      try {
        await action(idempotencyKey);
        endIdempotencyKey();
      } catch (error) {
        if (error instanceof SmsVersionConflictError) {
          endIdempotencyKey();
          feedback.error(friendlyMessage(error));
          await load();
          return;
        }
        if (error instanceof SmsSessionExpiredError || error instanceof SmsReauthenticationRequiredError) {
          endIdempotencyKey();
          setRequireReauth(true);
          feedback.error(friendlyMessage(error));
          return;
        }
        if (error instanceof SmsNetworkError) {
          // The backend may or may not have applied the effect. Keeping the key
          // means the user's retry carries the same idempotency key and the
          // backend can return the stored result instead of re-applying.
          feedback.error(friendlyMessage(error));
          return;
        }
        endIdempotencyKey();
        feedback.error(friendlyMessage(error));
      } finally {
        inFlight.current = null;
        setBusy(null);
      }
    },
    [feedback, load, beginIdempotencyKey, endIdempotencyKey],
  );

  const save = useCallback(
    (patch: SmsSettingsUpdatePayload['patch']) => {
      if (!snapshot) return;
      void run('save', async () => {
        const updated = await service.update({ expectedVersion: snapshot.version, patch });
        setSnapshot(updated);
        feedback.success('تنظیمات با موفقیت ذخیره شد.');
      });
    },
    [snapshot, service, run, feedback],
  );

  const rotate = useCallback(
    (secret: string) => {
      if (!snapshot) return;
      void run('rotate', async (idempotencyKey) => {
        const updated = await service.rotateSecret({
          secret,
          confirm: true,
          idempotencyKey,
        });
        setSnapshot(updated);
        feedback.success('کلید جدید اعمال شد.');
      });
    },
    [snapshot, service, run, feedback],
  );

  const clear = useCallback(() => {
    if (!snapshot) return;
    void run('clear', async (idempotencyKey) => {
      const updated = await service.clearSecret({
        confirm: true,
        idempotencyKey,
      });
      setSnapshot(updated);
      feedback.success('کلید پاک‌سازی شد.');
    });
  }, [snapshot, service, run, feedback]);

  const testSend = useCallback(() => {
    if (!snapshot) return;
    void run('test', async (idempotencyKey) => {
      const outcome = await service.testSend({
        confirm: true,
        idempotencyKey,
      });
      setLastOutcome(outcome);
      if (outcome.status === 'accepted') {
        feedback.success('پیام آزمایشی ارسال شد.');
      } else if (outcome.status === 'unknown_result') {
        feedback.warning('نتیجهٔ ارسال نامشخص است؛ برای اطلاع از وضعیت سرویس، وضعیت‌سنجی را بررسی کنید.');
      } else {
        feedback.warning('پیام آزمایشی نتوانست ارسال شود.');
      }
    });
  }, [snapshot, service, run, feedback]);

  const validateNow = useCallback(() => {
    void run('validate', async () => {
      const validation = await service.validate();
      setLastValidation(validation);
      feedback.success('بررسی پیکربندی انجام شد.');
    });
  }, [service, run, feedback]);

  return {
    status,
    loadError,
    snapshot,
    diagnostics,
    lastValidation,
    lastOutcome,
    busy,
    requireReauth,
    reload: load,
    save,
    rotate,
    clear,
    testSend,
    validateNow,
  };
}