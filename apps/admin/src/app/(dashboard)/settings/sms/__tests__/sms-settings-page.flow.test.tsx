import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SmsSettingsPage } from '@/components/sms/SmsSettingsPage';
import {
  resetSmsSettingsFixtureForTests,
  setSmsSettingsServiceOverrideForTests,
} from '@/lib/sms/sms-settings-guard';

describe('SMS settings page (fixture flow)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE = 'true';
    resetSmsSettingsFixtureForTests();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SMS_SETTINGS_FIXTURE;
    resetSmsSettingsFixtureForTests();
  });

  it('renders the header, fixture notice and a loaded summary', async () => {
    render(<SmsSettingsPage />);

    expect(screen.getByRole('heading', { name: 'تنظیمات سرویس پیامک' })).toBeInTheDocument();
    expect(screen.getByText(/فیکسچر قطعی/)).toBeInTheDocument();

    await screen.findByText('وضعیت سرویس پیامک');
    expect(screen.getAllByText('محیط: توسعه').length).toBeGreaterThan(0);
    expect(screen.getByText('نسخهٔ تنظیمات')).toBeInTheDocument();
  });

  it('saves edited settings against the loaded version', async () => {
    render(<SmsSettingsPage />);
    await screen.findByText('وضعیت سرویس پیامک');

    const templateField = screen.getByLabelText('شناسهٔ قالب تأیید (templateId)');
    fireEvent.change(templateField, { target: { value: '778899' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }));

    await screen.findByText('تنظیمات با موفقیت ذخیره شد.');
    expect(await screen.findByText('4')).toBeInTheDocument();
  });

  it('rejects an invalid template id locally without saving', async () => {
    render(<SmsSettingsPage />);
    await screen.findByText('وضعیت سرویس پیامک');

    const templateField = screen.getByLabelText('شناسهٔ قالب تأیید (templateId)');
    fireEvent.change(templateField, { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ تنظیمات' }));

    expect(await screen.findByText('باید یک عدد صحیح مثبت باشد')).toBeInTheDocument();
  });

  it('rotates the secret through the write-only dialog', async () => {
    render(<SmsSettingsPage />);
    await screen.findByText('وضعیت سرویس پیامک');

    fireEvent.click(screen.getByRole('button', { name: 'چرخش کلید' }));
    fireEvent.change(screen.getByLabelText('کلید جدید سرویس پیامک'), { target: { value: 'fresh-api-key-1234' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /جایگزین شود/ }));

    fireEvent.click(screen.getByRole('button', { name: 'ثبت کلید جدید' }));
    await screen.findByText('کلید جدید اعمال شد.');

    // The masked display stays fixed and the raw secret never appears.
    expect(screen.getAllByText('••••••••').length).toBeGreaterThan(0);
    expect(screen.queryByText('fresh-api-key-1234')).not.toBeInTheDocument();
  });

  it('clears the secret after explicit confirmation', async () => {
    render(<SmsSettingsPage />);
    await screen.findByText('وضعیت سرویس پیامک');

    fireEvent.click(screen.getByRole('button', { name: 'پاک‌سازی کلید' }));
    fireEvent.click(screen.getByRole('button', { name: 'پاک‌سازی کلید' }));

    await screen.findByText('کلید پاک‌سازی شد.');
    expect((await screen.findAllByText('خیر')).length).toBeGreaterThan(0);
  });

  it('sends a confirmed test message and shows the accepted outcome', async () => {
    render(<SmsSettingsPage />);
    await screen.findByText('وضعیت سرویس پیامک');

    fireEvent.click(screen.getByRole('button', { name: 'ارسال پیام آزمایشی' }));
    fireEvent.click(screen.getByRole('button', { name: 'ارسال آزمایشی' }));

    await screen.findByText('پیام آزمایشی ارسال شد.');
    expect(screen.getByText('ارجاع داده شد')).toBeInTheDocument();
  });

  it('shows an error state with a retry action when the service fails', async () => {
    setSmsSettingsServiceOverrideForTests({
      getSnapshot: async () => {
        throw new Error('upstream down');
      },
      diagnostics: async () => {
        throw new Error('upstream down');
      },
      update: async () => {
        throw new Error('upstream down');
      },
      rotateSecret: async () => {
        throw new Error('upstream down');
      },
      clearSecret: async () => {
        throw new Error('upstream down');
      },
      testSend: async () => {
        throw new Error('upstream down');
      },
      validate: async () => {
        throw new Error('upstream down');
      },
    });

    render(<SmsSettingsPage />);

    await screen.findByText('نمایش تنظیمات سرویس پیامک ممکن نیست');
    expect(screen.getByRole('button', { name: 'تلاش مجدد' })).toBeInTheDocument();
  });
});