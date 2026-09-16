import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackProvider } from '@/components/ui/FeedbackProvider';
import type { CatalogImportCommitResult, CatalogImportDryRunReport } from '@iranyaragh/contracts';
import { CatalogImportView } from '../CatalogImportView';

const mocks = vi.hoisted(() => ({
  uploadCatalogImport: vi.fn(),
  runCatalogImportDryRun: vi.fn(),
  commitCatalogImport: vi.fn(),
  keyCount: { value: 0 },
}));

vi.mock('@/lib/catalog/catalog-api', () => ({
  uploadCatalogImport: mocks.uploadCatalogImport,
  runCatalogImportDryRun: mocks.runCatalogImportDryRun,
  commitCatalogImport: mocks.commitCatalogImport,
  createIdempotencyKey: (prefix: string) => `${prefix}-key-${++mocks.keyCount.value}`,
}));

const zeroSummary = {
  products: { create: 1, update: 0, unchanged: 1, error: 0 },
  variants: { create: 1, update: 0, unchanged: 0, error: 1 },
  attributes: { create: 0, update: 1, unchanged: 0, error: 0 },
  options: { create: 1, update: 0, unchanged: 0, error: 0 },
};

const report: CatalogImportDryRunReport = {
  importId: 'imp-1',
  status: 'READY',
  totalRows: 4,
  truncated: false,
  issues: [
    {
      sheet: 'Variants',
      rowNumber: 3,
      key: null,
      code: 'IMPORT_VALIDATION',
      message: 'شناسهٔ تنوع خالی است.',
    },
  ],
  items: [],
  summary: zeroSummary,
};

const commitResult: CatalogImportCommitResult = {
  importId: 'imp-1',
  status: 'COMMITTED',
  committedAt: '2026-01-01T00:00:00Z',
  errorCount: 1,
  summary: zeroSummary,
};

function renderView() {
  return render(
    <FeedbackProvider>
      <CatalogImportView />
    </FeedbackProvider>,
  );
}

function writeFile(file: File) {
  renderView();
  fireEvent.change(screen.getByLabelText('فایل اکسل'), { target: { files: [file] } });
}

describe('CatalogImportView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.keyCount.value = 0;
    mocks.uploadCatalogImport.mockResolvedValue({ report });
    mocks.runCatalogImportDryRun.mockResolvedValue({ report: { ...report, totalRows: 5 } });
    mocks.commitCatalogImport.mockResolvedValue({ result: commitResult });
  });

  it('keeps the upload button disabled until a file is chosen', () => {
    renderView();
    const upload = screen.getByRole('button', { name: 'بارگذاری و پیش‌آزمایش' });
    expect(upload).toBeDisabled();
    fireEvent.click(upload);
    expect(mocks.uploadCatalogImport).not.toHaveBeenCalled();
  });

  it('rejects files without the .xlsx extension and oversized files', async () => {
    writeFile(new File([new Uint8Array(1)], 'catalog.xls'));
    expect(
      await screen.findByText('فقط فایل اکسل با پسوند .xlsx پشتیبانی می‌شود.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('فایل اکسل'), {
      target: { files: [new File([new Uint8Array(11 * 1024 * 1024)], 'catalog.xlsx')] },
    });
    expect(await screen.findByText('حجم فایل حداکثر ۱۰ مگابایت است.')).toBeInTheDocument();
  });

  it('uploads a workbook, runs the dry-run, and commits with stable idempotency keys', async () => {
    renderView();
    const file = new File([new Uint8Array(2)], 'catalog.xlsx');
    fireEvent.change(screen.getByLabelText('فایل اکسل'), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری و پیش‌آزمایش' }));
    await waitFor(() =>
      expect(mocks.uploadCatalogImport).toHaveBeenCalledWith(
        file,
        'catalog.xlsx',
        'catalog-import-upload-key-1',
      ),
    );
    expect(await screen.findByText('گزارش پیش‌آزمایش')).toBeInTheDocument();
    expect(screen.getByText('آمادهٔ اعمال')).toBeInTheDocument();
    expect(screen.getByText(/۱ خطای اعتبارسنجی/)).toBeInTheDocument();
    expect(screen.getByText('شناسهٔ تنوع خالی است.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'اجرای مجدد پیش‌آزمایش' }));
    await waitFor(() => expect(mocks.runCatalogImportDryRun).toHaveBeenCalledWith('imp-1'));
    expect(await screen.findByText(/۵ ردیف بررسی شد/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'اعمال تغییرات (Commit)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'اعمال نهایی' }));
    await waitFor(() =>
      expect(mocks.commitCatalogImport).toHaveBeenCalledWith('imp-1', 'catalog-import-commit-imp-1-key-2'),
    );
    expect(await screen.findByText('واردات با موفقیت اعمال شد')).toBeInTheDocument();
    expect(screen.getByText(/۱ ردیف به دلیل خطا اعمال نشد/)).toBeInTheDocument();
  });

  it('reuses the upload idempotency key across a failed retry', async () => {
    mocks.uploadCatalogImport.mockRejectedValueOnce(new Error('boom'));
    renderView();
    const file = new File([new Uint8Array(1)], 'catalog.xlsx');
    fireEvent.change(screen.getByLabelText('فایل اکسل'), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری و پیش‌آزمایش' }));
    expect(
      await screen.findByText('بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری و پیش‌آزمایش' }));
    await waitFor(() => expect(mocks.uploadCatalogImport).toHaveBeenCalledTimes(2));
    expect(mocks.uploadCatalogImport.mock.calls[0]?.[2]).toBe('catalog-import-upload-key-1');
    expect(mocks.uploadCatalogImport.mock.calls[1]?.[2]).toBe('catalog-import-upload-key-1');
  });

  it('surfaces commit failure without marking the import as applied', async () => {
    mocks.commitCatalogImport.mockRejectedValue(new Error('down'));
    renderView();
    const file = new File([new Uint8Array(1)], 'catalog.xlsx');
    fireEvent.change(screen.getByLabelText('فایل اکسل'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'بارگذاری و پیش‌آزمایش' }));
    await screen.findByText('گزارش پیش‌آزمایش');

    fireEvent.click(screen.getByRole('button', { name: 'اعمال تغییرات (Commit)' }));
    fireEvent.click(await screen.findByRole('button', { name: 'اعمال نهایی' }));
    expect(
      await screen.findByText('اعمال تغییرات ناموفق بود؛ دوباره تلاش کنید.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('واردات با موفقیت اعمال شد')).not.toBeInTheDocument();
  });
});