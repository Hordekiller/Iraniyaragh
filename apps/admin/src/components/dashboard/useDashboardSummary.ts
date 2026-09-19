'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AdminDashboardQuery, AdminDashboardSummary } from '@iranyaragh/contracts';
import {
  ApiAbortError,
  ApiClientError,
  ApiNetworkError,
} from '@/lib/api/client';
import { dashboardApi } from '@/lib/dashboard/dashboard-api';

export type DashboardRangeDays = 7 | 30 | 90;

export type DashboardLoadError = {
  kind: 'forbidden' | 'unauthorized' | 'network' | 'request';
  message: string;
  requestId?: string;
};

export type DashboardSummaryState = {
  summary: AdminDashboardSummary | null;
  loading: boolean;
  error: DashboardLoadError | null;
  refresh: () => void;
};

const DAY_MILLISECONDS = 24 * 60 * 60 * 1_000;

export function createDashboardRange(
  days: DashboardRangeDays,
  now = Date.now(),
): AdminDashboardQuery {
  return {
    createdFrom: new Date(now - days * DAY_MILLISECONDS).toISOString(),
    createdToExclusive: new Date(now).toISOString(),
  };
}

export function normalizeDashboardError(error: unknown): DashboardLoadError {
  if (error instanceof ApiClientError) {
    if (error.statusCode === 403) {
      return {
        kind: 'forbidden',
        message: 'مجوز مشاهدهٔ گزارش‌های عملیاتی برای این نشست فعال نیست.',
        requestId: error.requestId || undefined,
      };
    }
    if (error.statusCode === 401) {
      return {
        kind: 'unauthorized',
        message: 'نشست مدیریتی معتبر نیست؛ دوباره وارد شوید.',
        requestId: error.requestId || undefined,
      };
    }
    return {
      kind: 'request',
      message: 'گزارش عملیاتی از سرور دریافت نشد.',
      requestId: error.requestId || undefined,
    };
  }
  if (error instanceof ApiNetworkError) {
    return { kind: 'network', message: error.message };
  }
  return { kind: 'request', message: 'خطای غیرمنتظره در دریافت داشبورد رخ داد.' };
}

export function useDashboardSummary(
  rangeDays: DashboardRangeDays,
  enabled = true,
): DashboardSummaryState {
  const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<DashboardLoadError | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    setSummary(null);
    setLoading(true);
    setError(null);

    async function load(): Promise<void> {
      try {
        const nextSummary = await dashboardApi.getSummary(
          createDashboardRange(rangeDays),
          controller.signal,
        );
        if (!controller.signal.aborted) setSummary(nextSummary);
      } catch (caught: unknown) {
        if (controller.signal.aborted || caught instanceof ApiAbortError) return;
        setError(normalizeDashboardError(caught));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();

    return () => controller.abort();
  }, [enabled, rangeDays, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  return { summary, loading, error, refresh };
}
