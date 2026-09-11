import { afterEach, describe, expect, it, vi } from 'vitest';
import { expiryLabel, formatDateTime, sessionLabels } from '../session-labels';

describe('sessionLabels.authenticationLevel', () => {
  it('maps every contract value exhaustively', () => {
    expect(sessionLabels.authenticationLevel('STAFF_MFA').label).toBe('مهر دو عاملی');
    expect(sessionLabels.authenticationLevel('STAFF_MFA').tone).toBe('success');
    expect(sessionLabels.authenticationLevel('CUSTOMER_OTP').label).toBe('رمز یک‌بارمصرف');
    expect(sessionLabels.authenticationLevel('CUSTOMER_OTP').tone).toBe('info');
  });
});

describe('sessionLabels.deviceName', () => {
  it('falls back to an unknown-device label for blank/null names', () => {
    expect(sessionLabels.deviceName(null)).toBe('دستگاه ناشناخته');
    expect(sessionLabels.deviceName('   ')).toBe('دستگاه ناشناخته');
    expect(sessionLabels.deviceName('لپ‌تاپ عملیات')).toBe('لپ‌تاپ عملیات');
  });
});

describe('formatDateTime', () => {
  it('renders em dash for null or invalid input', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
  });

  it('renders a formatted Persian date for a valid timestamp', () => {
    const rendered = formatDateTime('2026-09-02T00:00:00.000Z');
    expect(rendered).not.toBe('—');
    expect(rendered.length).toBeGreaterThan(0);
  });
});

describe('expiryLabel', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('labels past expiry as expired', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const result = expiryLabel(new Date(1_699_000_000_000).toISOString());
    expect(result.label).toBe('منقضی شده');
    expect(result.tone).toBe('warning');
  });

  it('labels near expiry in minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const inMinutes = expiryLabel(new Date(1_700_000_000_000 + 10 * 60_000).toISOString());
    expect(inMinutes.label).toBe('10 دقیقه مانده');
  });

  it('labels mid-range expiry in hours', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const inHours = expiryLabel(new Date(1_700_000_000_000 + 5 * 3_600_000).toISOString());
    expect(inHours.label).toBe('5 ساعت مانده');
  });

  it('labels far expiry in days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_700_000_000_000));
    const inDays = expiryLabel(new Date(1_700_000_000_000 + 3 * 24 * 3_600_000).toISOString());
    expect(inDays.label).toBe('3 روز مانده');
  });

  it('renders neutral for an invalid timestamp', () => {
    expect(expiryLabel('bad')).toEqual({ label: '—', tone: 'neutral' });
  });
});