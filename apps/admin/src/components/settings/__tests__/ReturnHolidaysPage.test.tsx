import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/returns/returns-api';
import { ReturnHolidaysPage } from '../ReturnHolidaysPage';

const auth = vi.hoisted(() => ({ permissions: ['settings.manage'] as string[], isRestoring: false }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { userId: 'staff-1', permissions: auth.permissions }, isRestoring: auth.isRestoring }) }));
vi.mock('@/lib/returns/returns-api', () => ({ listReturnHolidays: vi.fn(), addReturnHoliday: vi.fn(), removeReturnHoliday: vi.fn(), readReturnsSettings: vi.fn(), saveReturnsSettings: vi.fn() }));

const holiday = { id: 'h1', dateKey: '2027-03-21', label: 'نوروز', createdAt: '2026-11-09T00:00:00.000Z' };

describe('ReturnHolidaysPage', () => {
  beforeEach(() => {
    auth.permissions = ['settings.manage']; auth.isRestoring = false;
    vi.mocked(api.listReturnHolidays).mockReset().mockResolvedValue([holiday]);
    vi.mocked(api.addReturnHoliday).mockReset().mockResolvedValue(holiday);
    vi.mocked(api.removeReturnHoliday).mockReset().mockResolvedValue(undefined);
    vi.mocked(api.readReturnsSettings).mockReset().mockResolvedValue({ enabled: false, version: 0, updatedAt: null });
    vi.mocked(api.saveReturnsSettings).mockReset().mockImplementation(async (body) => ({ enabled: body.enabled, version: body.expectedVersion + 1, updatedAt: '2026-11-09T00:00:00.000Z' }));
  });

  it('is closed without settings.manage and calls no API', () => {
    auth.permissions = [];
    render(<ReturnHolidaysPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('دسترسی مدیریت تنظیمات لازم است.');
    expect(api.listReturnHolidays).not.toHaveBeenCalled();
    expect(api.readReturnsSettings).not.toHaveBeenCalled();
  });

  it('states the approved policy and lists holidays', async () => {
    render(<ReturnHolidaysPage />);
    expect(await screen.findByRole('table', { name: 'تعطیلات ثبت‌شده' })).toHaveTextContent('نوروز');
    expect(screen.getByText(/۲ روز کاری برای تحویل حضوری و ۱ هفته/)).toBeInTheDocument();
    expect(screen.getByText(/جمعه همیشه تعطیل است/)).toBeInTheDocument();
  });

  it('shows returns as OFF by default and explains what off does and does not block', async () => {
    render(<ReturnHolidaysPage />);
    expect(await screen.findByText('ثبت مرجوعی جدید: غیرفعال')).toBeInTheDocument();
    expect(screen.getByText(/خاموش بودن، مشاهدهٔ مرجوعی‌ها و ثبت استرداد مرجوعی‌های قبلی را نمی‌بندد/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ذخیرهٔ وضعیت' })).toBeDisabled(); // nothing changed yet
  });

  it('turns returns on with the current version and shows the saved state', async () => {
    render(<ReturnHolidaysPage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'ثبت مرجوعی جدید: غیرفعال' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ وضعیت' }));
    expect(await screen.findByText('ثبت مرجوعی جدید فعال شد.')).toBeInTheDocument();
    expect(api.saveReturnsSettings).toHaveBeenCalledWith({ expectedVersion: 0, enabled: true });
    expect(await screen.findByText('ثبت مرجوعی جدید: فعال')).toBeInTheDocument();
  });

  it('turns returns off and says recorded returns and their refunds are untouched', async () => {
    vi.mocked(api.readReturnsSettings).mockResolvedValue({ enabled: true, version: 3, updatedAt: '2026-11-09T00:00:00.000Z' });
    render(<ReturnHolidaysPage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'ثبت مرجوعی جدید: فعال' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ وضعیت' }));
    expect(await screen.findByText(/مرجوعی‌های ثبت‌شده و استرداد آن‌ها دست‌نخورده‌اند/)).toBeInTheDocument();
    expect(api.saveReturnsSettings).toHaveBeenCalledWith({ expectedVersion: 3, enabled: false });
  });

  it('re-reads the real state after a failed save instead of assuming it', async () => {
    vi.mocked(api.saveReturnsSettings).mockRejectedValueOnce(new Error('connection lost'));
    render(<ReturnHolidaysPage />);
    fireEvent.click(await screen.findByRole('switch', { name: 'ثبت مرجوعی جدید: غیرفعال' }));
    fireEvent.click(screen.getByRole('button', { name: 'ذخیرهٔ وضعیت' }));
    expect(await screen.findByText(/ارتباط با سامانه برقرار نشد/)).toBeInTheDocument();
    await waitFor(() => expect(api.readReturnsSettings).toHaveBeenCalledTimes(2));
  });

  it('validates the date shape before sending and then adds a holiday', async () => {
    render(<ReturnHolidaysPage />);
    await screen.findByRole('table', { name: 'تعطیلات ثبت‌شده' });
    const add = screen.getByRole('button', { name: 'افزودن تعطیلی' });
    fireEvent.change(screen.getByLabelText(/تاریخ تعطیلی/), { target: { value: '21/03/2027' } });
    fireEvent.change(screen.getByLabelText('عنوان تعطیلی'), { target: { value: 'نوروز' } });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/تاریخ تعطیلی/), { target: { value: '2027-03-22' } });
    expect(add).toBeEnabled();
    fireEvent.click(add);
    await waitFor(() => expect(api.addReturnHoliday).toHaveBeenCalledWith({ dateKey: '2027-03-22', label: 'نوروز' }));
  });

  it('removes a holiday and reports a failure instead of pretending it worked', async () => {
    vi.mocked(api.removeReturnHoliday).mockRejectedValueOnce(new Error('boom'));
    render(<ReturnHolidaysPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'حذف نوروز' }));
    expect(await screen.findByText(/ارتباط با سامانه برقرار نشد/)).toBeInTheDocument();
  });
});
