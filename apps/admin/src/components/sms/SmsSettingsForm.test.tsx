import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { SmsSettingsForm } from './SmsSettingsForm';

const snapshot: SmsSettingsSnapshot = {
  version: 1, updatedAt: null, secretBackend: 'read_only',
  settings: {
    environment: 'production', enabled: false, templateId: null,
    senderLine: null, timeoutMs: 5000, deliveryStatusEnabled: false,
    outageMode: true, maintenanceMessage: null, alertThresholds: null,
  },
  secret: { configured: true, masked: '••••••••', validated: false, lastRotatedAt: null },
};

describe('SMS effective settings display', () => {
  it('shows refreshed environment-managed values even when the snapshot version is unchanged', () => {
    const submit = vi.fn();
    const { rerender } = render(<SmsSettingsForm snapshot={snapshot} busy={false} onSubmit={submit} />);
    expect(screen.getByLabelText('شناسهٔ قالب تأیید (templateId)')).toHaveValue('');
    const refreshed = { ...snapshot, settings: { ...snapshot.settings, templateId: 123456,
      timeoutMs: 4000, enabled: true, outageMode: false } };
    rerender(<SmsSettingsForm snapshot={refreshed} busy={false} onSubmit={submit} />);
    expect(screen.getByLabelText('شناسهٔ قالب تأیید (templateId)')).toHaveValue('123456');
    expect(screen.getByLabelText('مهلت درخواست (میلی‌ثانیه)')).toHaveValue('4000');
    expect(screen.getByRole('checkbox', { name: 'ارسال پیامک OTP فعال باشد' })).toBeChecked();
    expect(screen.queryByText(/حالت قطع سرویس فعال است/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ تنظیمات' })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('preserves an editable draft when diagnostics refresh the same server revision', () => {
    const writable = { ...snapshot, secretBackend: 'writable' as const,
      settings: { ...snapshot.settings, templateId: 123456 } };
    const { rerender } = render(<SmsSettingsForm snapshot={writable} busy={false} onSubmit={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('شناسهٔ قالب تأیید (templateId)'), { target: { value: '654321' } });
    rerender(<SmsSettingsForm snapshot={{ ...writable, settings: { ...writable.settings },
      secret: { ...writable.secret, validated: true } }} busy={false} onSubmit={vi.fn()} />);
    expect(screen.getByLabelText('شناسهٔ قالب تأیید (templateId)')).toHaveValue('654321');
  });
});
