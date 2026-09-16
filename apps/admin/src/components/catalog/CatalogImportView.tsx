'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { ArrowRight, CheckCircle2, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import type {
  CatalogImportCommitResult,
  CatalogImportDryRunReport,
  CatalogImportStatus,
} from '@iranyaragh/contracts';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusChip, type StatusTone } from '@/components/ui/StatusChip';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import {
  commitCatalogImport,
  createIdempotencyKey,
  runCatalogImportDryRun,
  uploadCatalogImport,
} from '@/lib/catalog/catalog-api';

const MAX_BYTES = 10 * 1024 * 1024;

const IMPORT_STATUS_META: Record<CatalogImportStatus, { label: string; tone: StatusTone }> = {
  UPLOADED: { label: 'بارگذاری‌شده', tone: 'neutral' },
  READY: { label: 'آمادهٔ اعمال', tone: 'info' },
  COMMITTED: { label: 'اعمال‌شده', tone: 'success' },
  FAILED: { label: 'ناموفق', tone: 'error' },
};

const IMPORT_SHEETS = ['Products', 'Variants', 'Attributes', 'AttributeOptions', 'VariantAttributeValues'];

const faNumber = new Intl.NumberFormat('fa-IR');

type SummaryBlock = { title: string; create: number; update: number; unchanged: number; error: number };

function summaryBlocks(report: CatalogImportDryRunReport): SummaryBlock[] {
  return [
    { title: 'کالاها', ...report.summary.products },
    { title: 'تنوع‌ها', ...report.summary.variants },
    { title: 'ویژگی‌ها', ...report.summary.attributes },
    { title: 'گزینه‌ها', ...report.summary.options },
  ];
}

export function CatalogImportView() {
  const feedback = useFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [report, setReport] = useState<CatalogImportDryRunReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [commitConfirmOpen, setCommitConfirmOpen] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<CatalogImportCommitResult | null>(null);
  const idempotencyKeys = useRef<{ upload?: string; commit?: string }>({});

  function handleFileChange(next: File | null) {
    setFile(next);
    setFileError(null);
    if (!next) return;
    if (!next.name.toLocaleLowerCase('en-US').endsWith('.xlsx')) {
      setFileError('فقط فایل اکسل با پسوند .xlsx پشتیبانی می‌شود.');
      return;
    }
    if (next.size > MAX_BYTES) {
      setFileError('حجم فایل حداکثر ۱۰ مگابایت است.');
      return;
    }
  }

  async function handleUpload() {
    if (!file) {
      setFileError('ابتدا یک فایل انتخاب کنید.');
      return;
    }
    if (fileError) return;
    setUploading(true);
    setCommitResult(null);
    setReport(null);
    idempotencyKeys.current.upload ??= createIdempotencyKey('catalog-import-upload');
    try {
      const data = await uploadCatalogImport(file, file.name, idempotencyKeys.current.upload);
      setReport(data.report);
      idempotencyKeys.current.upload = undefined;
      feedback.success('فایل بارگذاری و پیش‌آزمایش انجام شد.');
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'بارگذاری فایل ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDryRun() {
    if (!report) return;
    setReportLoading(true);
    try {
      const data = await runCatalogImportDryRun(report.importId);
      setReport(data.report);
      feedback.success('پیش‌آزمایش مجدد انجام شد.');
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'انجام پیش‌آزمایش ناموفق بود.');
    } finally {
      setReportLoading(false);
    }
  }

  async function handleCommit() {
    if (!report) return;
    setCommitConfirmOpen(false);
    setCommitting(true);
    idempotencyKeys.current.commit ??= createIdempotencyKey(`catalog-import-commit-${report.importId}`);
    try {
      const data = await commitCatalogImport(report.importId, idempotencyKeys.current.commit);
      setCommitResult(data.result);
      feedback.success('تغییرات کاتالوگ اعمال شد.');
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'اعمال تغییرات ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setCommitting(false);
    }
  }

  const sheetsText = IMPORT_SHEETS.map((sheet) => `«${sheet}»`).join('، ');

  return (
    <>
      <PageHeader
        title="واردات کاتالوگ"
        eyebrow="کاتالوگ"
        description="بارگذاری کتاب‌کار اکسل نسخهٔ ۱ و اعمال امن آن. ابتدا پیش‌آزمایش انجام می‌شود و پس از بررسی گزارش، تغییرات با یک فرمان نهایی کمییت می‌شوند."
        breadcrumbs={[{ label: 'کالا و انبار' }, { label: 'واردات کاتالوگ' }]}
        actions={
          <Button component={Link} href="/catalog" size="small" startIcon={<ArrowRight size={18} />}>
            بازگشت به کالا و SKU
          </Button>
        }
      />

      {commitResult ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2} alignItems="flex-start">
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckCircle2 size={20} color="success.main" />
                <Typography variant="subtitle1" fontWeight={800}>
                  واردات با موفقیت اعمال شد
                </Typography>
              </Stack>
              <Chip
                label={`اعمال‌شده در ${new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(commitResult.committedAt))}`}
                variant="outlined"
                color="success"
              />
              <Grid container spacing={2} sx={{ maxWidth: 720 }}>
                {summaryBlocks({ ...report!, summary: commitResult.summary }).map((block) => (
                  <Grid size={{ xs: 6, sm: 3 }} key={block.title}>
                    <Typography variant="subtitle2" fontWeight={700}>
                      {block.title}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ایجاد {faNumber.format(block.create)} — ویرایش {faNumber.format(block.update)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      بدون تغییر {faNumber.format(block.unchanged)} — خطا {faNumber.format(block.error)}
                    </Typography>
                  </Grid>
                ))}
              </Grid>
              {commitResult.errorCount > 0 ? (
                <Alert severity="warning">{faNumber.format(commitResult.errorCount)} ردیف به دلیل خطا اعمال نشد.</Alert>
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={3}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1 }}>
                گام ۱ — بارگذاری کتاب‌کار
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                نسخهٔ ۱ با ۵ شیت به همین ترتیب لازم است: {sheetsText}.
                ستون‌ها انگلیسی و تمام ردیف‌ها باید به‌صورت متن ذخیره شده باشند.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
                <FormField label="فایل اکسل" htmlFor="catalog-import-file" helperText="حداکثر ۱۰ مگابایت">
                  <input
                    id="catalog-import-file"
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                    style={{ direction: 'ltr' }}
                  />
                </FormField>
                <Button
                  variant="contained"
                  size="small"
                  disabled={!file || uploading || reportLoading}
                  onClick={() => void handleUpload()}
                  startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <Upload size={16} />}
                  sx={{ mt: { xs: 0, sm: 2.5 } }}
                >
                  {uploading ? 'در حال بارگذاری…' : 'بارگذاری و پیش‌آزمایش'}
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  disabled={!report || uploading || reportLoading}
                  onClick={() => void handleDryRun()}
                  startIcon={reportLoading ? <CircularProgress size={16} /> : <RefreshCw size={16} />}
                  sx={{ mt: { xs: 0, sm: 2.5 } }}
                >
                  {reportLoading ? 'در حال پیش‌آزمایش…' : 'اجرای مجدد پیش‌آزمایش'}
                </Button>
              </Stack>
              {fileError ? <Alert severity="error" sx={{ mt: 2 }}>{fileError}</Alert> : null}
              {file ? (
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }} dir="ltr" textAlign="start">
                  {file.name} — {new Intl.NumberFormat('fa-IR').format(file.size)} بایت
                </Typography>
              ) : null}
            </CardContent>
          </Card>

          {report ? <ImportReport report={report} onCommitRequest={() => setCommitConfirmOpen(true)} /> : null}

          <ConfirmationDialog
            open={commitConfirmOpen}
            setOpen={setCommitConfirmOpen}
            type="dangerous"
            title="اعمال تغییرات کاتالوگ"
            description="این عملیات پس از ثبت قابل بازگردانی نیست. مطمئن هستید که می‌خواهید همهٔ تغییرات پیش‌آزمایش‌شده را اعمال کنید؟"
            confirmLabel="اعمال نهایی"
            loading={committing}
            onConfirm={() => void handleCommit()}
          />
        </Stack>
      )}
    </>
  );
}

function ImportReport({
  report,
  onCommitRequest,
}: {
  report: CatalogImportDryRunReport;
  onCommitRequest: () => void;
}) {
  const canCommit = report.status === 'UPLOADED' || report.status === 'READY';
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <FileSpreadsheet size={18} />
          <Typography variant="subtitle1" fontWeight={800}>
            گزارش پیش‌آزمایش
          </Typography>
          <StatusChip label={IMPORT_STATUS_META[report.status].label} tone={IMPORT_STATUS_META[report.status].tone} />
        </Stack>

        {report.issues.length > 0 ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {faNumber.format(report.issues.length)} خطای اعتبارسنجی — ردیف‌های خطادار اعمال نمی‌شوند.
          </Alert>
        ) : (
          <Alert severity="success" sx={{ mb: 2 }}>
            هیچ خطای اعتبارسنجی‌ای یافت نشد.
          </Alert>
        )}

        <Grid container spacing={2}>
          {summaryBlocks(report).map((block) => (
            <Grid size={{ xs: 6, sm: 3 }} key={block.title}>
              <Typography variant="subtitle2" fontWeight={700}>
                {block.title}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                ایجاد {faNumber.format(block.create)} — ویرایش {faNumber.format(block.update)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                بدون تغییر {faNumber.format(block.unchanged)} — خطا {faNumber.format(block.error)}
              </Typography>
            </Grid>
          ))}
        </Grid>

        {report.totalRows > 0 ? (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            {faNumber.format(report.totalRows)} ردیف بررسی شد.
            {report.truncated ? ' گزارش فهرست ردیف‌ها کامل نیست و بخشی حذف شده است.' : ''}
          </Typography>
        ) : null}

        {report.issues.length > 0 ? (
          <TableContainer sx={{ maxHeight: 280, mt: 2 }}>
            <Table size="small" stickyHeader aria-label="خطاهای اعتبارسنجی واردات">
              <TableHead>
                <TableRow>
                  <TableCell>شیت</TableCell>
                  <TableCell>ردیف</TableCell>
                  <TableCell>کد خطا</TableCell>
                  <TableCell>شرح</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.issues.map((issue, index) => (
                  <TableRow key={index}>
                    <TableCell>{issue.sheet}</TableCell>
                    <TableCell>{faNumber.format(issue.rowNumber)}</TableCell>
                    <TableCell>
                      <Typography variant="body2" dir="ltr" textAlign="start">
                        {issue.code}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {issue.message}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : null}

        {canCommit ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
            <Button variant="contained" color="error" onClick={onCommitRequest}>
              اعمال تغییرات (Commit)
            </Button>
          </Box>
        ) : null}
      </CardContent>
    </Card>
  );
}