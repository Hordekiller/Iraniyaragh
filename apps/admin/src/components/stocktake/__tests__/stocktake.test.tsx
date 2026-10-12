import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StocktakeDetail } from '@iranyaragh/contracts';
import { ApiClientError, ApiNetworkError } from '@/lib/api/client';
import { StocktakeDetailView } from '../StocktakeDetailView';
import { StocktakesView } from '../StocktakesView';
import { StocktakeCreateDialog } from '../StocktakeCreateDialog';

const mocks = vi.hoisted(() => ({
  permissions: ['stocktake.read', 'stocktake.manage', 'stocktake.count', 'stocktake.approve'] as string[],
  get: vi.fn(), history: vi.fn(), list: vi.fn(), create: vi.fn(), start: vi.fn(), count: vi.fn(), submit: vi.fn(), approve: vi.fn(), cancel: vi.fn(),
  warehouses: vi.fn(), locations: vi.fn(), variants: vi.fn(), push: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/lib/auth/AuthProvider', () => ({ useAuth: () => ({ user: { permissions: mocks.permissions } }) }));
vi.mock('@/lib/stocktake/stocktake-api', async importOriginal => ({
  ...await importOriginal<object>(), getStocktake: mocks.get, getStocktakeHistory: mocks.history, listStocktakes: mocks.list,
  createStocktake: mocks.create, startStocktake: mocks.start, recordStocktakeCounts: mocks.count, submitStocktake: mocks.submit,
  approveStocktake: mocks.approve, cancelStocktake: mocks.cancel, listStocktakeWarehouses: mocks.warehouses,
  listStocktakeLocations: mocks.locations, listStocktakeVariants: mocks.variants,
}));

const sheet = (changes: Partial<StocktakeDetail> = {}): StocktakeDetail => ({
  id: 'sheet-1', number: 'ST-TEST', status: 'COUNTING', scopeType: 'WAREHOUSE', version: 1,
  warehouseId: 'warehouse-1', warehouseCode: 'WH-TEST', warehouseName: 'انبار آزمون', notes: null,
  createdById: 'staff-1', countedById: 'staff-1', approvedById: null, createdAt: '2026-10-11T12:00:00Z', updatedAt: '2026-10-11T12:00:00Z',
  startedAt: '2026-10-11T12:00:00Z', submittedAt: null, completedAt: null, cancelledAt: null,
  summary: { totalLines: 1, countedLines: 0, pendingLines: 1, netDifference: 0 },
  lines: [{ id: 'line-1', locationId: 'location-1', locationCode: 'LOC-TEST', locationName: null,
    variantId: 'variant-1', sku: 'SKU-TEST', productName: 'کالای آزمون', variantTitle: null, expectedQty: 10,
    countedQty: null, difference: null, countedAt: null, notes: null, countedById: null, movementId: null }], ...changes,
});
const failure = (code: string, statusCode = 409) => new ApiClientError({ code, statusCode, message: 'internal detail must not appear', requestId: 'safe-request-id' });

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [mocks.get, mocks.history, mocks.list, mocks.create, mocks.start, mocks.count, mocks.submit, mocks.approve, mocks.cancel]) fn.mockReset();
  mocks.permissions = ['stocktake.read', 'stocktake.manage', 'stocktake.count', 'stocktake.approve'];
  mocks.get.mockResolvedValue(sheet()); mocks.history.mockResolvedValue({ items: [], count: 0 });
  mocks.list.mockResolvedValue({ items: [sheet()], count: 1 });
  mocks.warehouses.mockResolvedValue({ items: [{ id: 'warehouse-1', code: 'WH-TEST', label: 'انبار آزمون' }], count: 1 });
  mocks.locations.mockResolvedValue({ items: [{ id: 'location-1', code: 'LOC-TEST', label: 'مکان آزمون' }], count: 1 });
  mocks.variants.mockResolvedValue({ items: [{ id: 'variant-1', sku: 'SKU-TEST', label: 'کالای آزمون' }], count: 1 });
});

describe('Stocktake count sheet operator states', () => {
  it('does not request protected data without read permission', () => {
    mocks.permissions = [];
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    expect(screen.getByText('مجوز مشاهدهٔ انبارگردانی را ندارید.')).toBeInTheDocument();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('keeps counters blind, validates integer input and disables incomplete submission', async () => {
    mocks.permissions = ['stocktake.read', 'stocktake.count', 'stocktake.manage'];
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    const input = await screen.findByRole('textbox', { name: 'مقدار شمارش SKU-TEST' });
    expect(screen.queryByRole('columnheader', { name: 'انتظاری' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeDisabled();
    fireEvent.change(input, { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /ثبت .*خط/ }));
    expect(await screen.findByText(/تعداد شمارش باید عدد صحیح/)).toBeInTheDocument();
    expect(mocks.count).not.toHaveBeenCalled();
    const counted = sheet({ version: 2, summary: { totalLines: 1, countedLines: 1, pendingLines: 0 } });
    mocks.count.mockResolvedValue(counted);
    fireEvent.change(input, { target: { value: '۰' } });
    fireEvent.click(screen.getByRole('button', { name: /ثبت .*خط/ }));
    await waitFor(() => expect(mocks.count).toHaveBeenCalledWith('sheet-1', { expectedVersion: 1,
      lines: [{ locationId: 'location-1', variantId: 'variant-1', countedQty: 0, notes: null }] }, expect.stringMatching(/^st-/u)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'ارسال برای بازبینی' })).toBeEnabled());
  });

  it('freezes an ambiguous payload/key and reconciles before replay instead of a new submission', async () => {
    mocks.count.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce(sheet({ version: 2 }));
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    const input = await screen.findByRole('textbox', { name: 'مقدار شمارش SKU-TEST' });
    fireEvent.change(input, { target: { value: '7' } });
    fireEvent.click(screen.getByRole('button', { name: /ثبت .*خط/ }));
    expect(await screen.findByText(/نتیجهٔ دستور هنوز مشخص نیست/)).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByRole('button', { name: 'لغو برگه' })).toBeDisabled();
    const first = mocks.count.mock.calls[0];
    mocks.get.mockResolvedValue(sheet({ version: 42 }));
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و تکرار همان دستور' }));
    await waitFor(() => expect(mocks.count).toHaveBeenCalledTimes(2));
    expect(mocks.count.mock.calls[1]).toEqual(first);
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('uses management for opening/submission and count permission only for observations', async () => {
    mocks.permissions = ['stocktake.read', 'stocktake.manage'];
    mocks.get.mockResolvedValue(sheet({ status: 'DRAFT', version: 0, lines: [] }));
    mocks.start.mockResolvedValue(sheet());
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'آغاز شمارش' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('sheet-1', { expectedVersion: 0 }, expect.any(String)));
    expect(screen.queryByRole('textbox', { name: 'مقدار شمارش SKU-TEST' })).not.toBeInTheDocument();
  });

  it('freezes review and completion and renders approval and linked movement evidence', async () => {
    const reviewed = sheet({ status: 'REVIEW', version: 3, summary: { totalLines: 1, countedLines: 1, pendingLines: 0, netDifference: -3 } });
    mocks.get.mockResolvedValue(reviewed);
    mocks.approve.mockResolvedValue({ ...reviewed, status: 'COMPLETED', version: 4,
      lines: [{ ...reviewed.lines[0], countedQty: 7, difference: -3, movementId: 'ledger-movement-1' }] });
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    expect(await screen.findByRole('button', { name: 'تأیید و اعمال روی دفترکل' })).toBeEnabled();
    expect(screen.queryByRole('textbox', { name: 'مقدار شمارش SKU-TEST' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'تأیید و اعمال روی دفترکل' }));
    expect(await screen.findByText('ledger-movement-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'لغو برگه' })).not.toBeInTheDocument();
  });

  it('shows reserved/version conflicts without success or raw internal error details', async () => {
    mocks.get.mockResolvedValue(sheet({ status: 'REVIEW', summary: { totalLines: 1, countedLines: 1, pendingLines: 0 } }));
    mocks.approve.mockRejectedValue(failure('STOCKTAKE_RESERVED_EXCEEDS_COUNT'));
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    fireEvent.click(await screen.findByRole('button', { name: 'تأیید و اعمال روی دفترکل' }));
    expect(await screen.findByText(/هیچ تغییری اعمال نشد/)).toBeInTheDocument();
    expect(screen.queryByText('دستور ثبت شد.')).not.toBeInTheDocument();
    expect(screen.queryByText('internal detail must not appear')).not.toBeInTheDocument();
  });

  it('recovers read failures and renders scoped lifecycle history', async () => {
    mocks.get.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce(sheet());
    mocks.history.mockResolvedValue({ items: [{ id: 'audit-1', action: 'stocktake.started', actorId: 'staff-1', createdAt: '2026-10-11T12:00:00Z' }], count: 1 });
    render(<StocktakeDetailView stocktakeId="sheet-1" />);
    const buttons = await screen.findAllByRole('button', { name: 'تلاش دوباره' });
    fireEvent.click(buttons[0]);
    // The table shell mounts before its independent history request resolves.
    // Await the actual row content rather than treating table existence as readiness.
    const history = await screen.findByRole('table', { name: 'تاریخچهٔ انبارگردانی' });
    await waitFor(() => expect(history).toHaveTextContent('staff-1'));
    expect(mocks.history).toHaveBeenCalledWith('sheet-1', { offset: 0, limit: 10 }, expect.any(AbortSignal));
  });
});

describe('Stocktake list and creation', () => {
  it('has server pagination, filters and permission-aware creation controls', async () => {
    mocks.permissions = ['stocktake.read'];
    render(<StocktakesView />);
    expect(await screen.findByText('ST-TEST')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'برگهٔ جدید' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'شناسه انبار' }), { target: { value: 'warehouse-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'اعمال فیلتر' }));
    await waitFor(() => expect(mocks.list).toHaveBeenLastCalledWith({ status: undefined, warehouseId: 'warehouse-2', offset: 0, limit: 25 }, expect.any(AbortSignal)));
  });

  it('selects persisted warehouse IDs and keeps one creation key/payload through ambiguity', async () => {
    mocks.create.mockRejectedValueOnce(new ApiNetworkError('offline')).mockResolvedValueOnce(sheet({ status: 'DRAFT' }));
    const created = vi.fn();
    render(<StocktakeCreateDialog onClose={vi.fn()} onCreated={created} />);
    fireEvent.click(screen.getByRole('button', { name: 'ثبت برگه' }));
    expect(screen.getByText('انبار و دامنهٔ شمارش را انتخاب کنید.')).toBeInTheDocument();
    const picker = screen.getByRole('combobox', { name: 'انبار' });
    fireEvent.mouseDown(picker);
    fireEvent.click(await screen.findByRole('option', { name: 'WH-TEST — انبار آزمون' }));
    fireEvent.click(screen.getByRole('button', { name: 'ثبت برگه' }));
    expect(await screen.findByText(/نتیجهٔ دستور هنوز مشخص نیست/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ثبت برگه' })).toBeDisabled();
    const first = mocks.create.mock.calls[0];
    fireEvent.click(screen.getByRole('button', { name: 'بازخوانی و تکرار همان دستور' }));
    await waitFor(() => expect(created).toHaveBeenCalledWith('sheet-1'));
    expect(mocks.create.mock.calls[1]).toEqual(first);
    expect(first[0]).toEqual({ warehouseId: 'warehouse-1', scopeType: 'WAREHOUSE', notes: null });
  });
});
