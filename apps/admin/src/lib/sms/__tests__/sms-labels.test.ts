import { describe, expect, it } from 'vitest';
import type {
  SmsCircuitState,
  SmsErrorClass,
  SmsProviderEnvironment,
  SmsProviderHealth,
  SmsSecretBackendCapability,
  SmsSendStatus,
} from '@iranyaragh/contracts';
import { formatDateTime, smsLabels, yesNo } from '../sms-labels';

describe('smsLabels', () => {
  it('labels every provider environment', () => {
    const environments: SmsProviderEnvironment[] = ['development', 'production', 'unknown'];
    for (const value of environments) {
      expect(typeof smsLabels.environment(value)).toBe('string');
    }
    expect(smsLabels.environment('development')).toBe('توسعه');
  });

  it('labels both secret backends with tone and note', () => {
    const backends: SmsSecretBackendCapability[] = ['writable', 'read_only'];
    for (const value of backends) {
      const entry = smsLabels.backendOf(value);
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.note.length).toBeGreaterThan(0);
    }
    expect(smsLabels.backendOf('writable').tone).toBe('success');
    expect(smsLabels.backendOf('read_only').tone).toBe('info');
  });

  it('labels every provider health state', () => {
    const states: SmsProviderHealth[] = ['ok', 'degraded', 'down', 'not_configured', 'unknown'];
    for (const value of states) {
      expect(smsLabels.health(value).label.length).toBeGreaterThan(0);
    }
    expect(smsLabels.health('ok')).toEqual({ label: 'سالم', tone: 'success' });
  });

  it('labels every circuit state', () => {
    const states: SmsCircuitState[] = ['closed', 'open', 'half_open', 'unknown'];
    for (const value of states) {
      expect(smsLabels.circuit(value).label.length).toBeGreaterThan(0);
    }
    expect(smsLabels.circuit('open')).toEqual({ label: 'باز', tone: 'error' });
  });

  it('labels error classes including the null sentinel', () => {
    const classes: SmsErrorClass[] = [
      'auth',
      'rate_limit',
      'invalid_request',
      'provider_error',
      'timeout',
      'not_configured',
    ];
    for (const value of classes) {
      expect(typeof smsLabels.errorClass(value)).toBe('string');
    }
    expect(smsLabels.errorClass(null)).toBe('بدون خطا');
  });

  it('labels every send status', () => {
    const statuses: SmsSendStatus[] = ['accepted', 'rejected', 'rate_limited', 'unavailable', 'unknown_result'];
    for (const value of statuses) {
      expect(smsLabels.sendStatus(value).label.length).toBeGreaterThan(0);
    }
    expect(smsLabels.sendStatus('accepted')).toEqual({ label: 'ارجاع داده شد', tone: 'success' });
  });

  it('formats ISO timestamps for the Persian UI and degrades gracefully', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('not-a-date')).toBe('—');
    expect(formatDateTime('2026-09-01T07:00:00.000Z').length).toBeGreaterThan(0);
  });

  it('answers boolean display questions', () => {
    expect(yesNo(true)).toBe('بله');
    expect(yesNo(false)).toBe('خیر');
  });
});