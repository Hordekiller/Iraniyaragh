'use client';

import { useMemo } from 'react';
import type { SmsSettingsEditableFields, SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Switch, TextField, Typography } from '@mui/material';
import { FormField } from '@/components/ui/FormField';
import { maxLength, pattern, required, useInHouseForm } from '@/components/ui/useInHouseForm';

export type SmsSettingsFormProps = {
  snapshot: SmsSettingsSnapshot;
  busy: boolean;
  onSubmit: (patch: SmsSettingsUpdatePatch) => void;
};

export type SmsSettingsUpdatePatch = Partial<SmsSettingsEditableFields>;

type FormValues = {
  enabled: boolean;
  templateId: string;
  senderLine: string;
  timeoutMs: string;
  deliveryStatusEnabled: boolean;
  outageMode: boolean;
  maintenanceMessage: string;
  failureWindowMinutes: string;
  failureCount: string;
};

const positiveInteger = pattern(/^[1-9]\d*$/, 'باید یک عدد صحیح مثبت باشد');
const bothOrNone = (values: Record<string, unknown>) => {
  const window = (values.failureWindowMinutes as string).trim();
  const count = (values.failureCount as string).trim();
  if (window === '' && count === '') return null;
  if (window === '' || count === '') return 'هر دو مقدار را پر کنید یا هر دو را خالی بگذارید';
  return null;
};

function toFormValues(settings: SmsSettingsSnapshot['settings']): FormValues {
  return {
    enabled: settings.enabled,
    templateId: settings.templateId === null ? '' : String(settings.templateId),
    senderLine: settings.senderLine ?? '',
    timeoutMs: String(settings.timeoutMs),
    deliveryStatusEnabled: settings.deliveryStatusEnabled,
    outageMode: settings.outageMode,
    maintenanceMessage: settings.maintenanceMessage ?? '',
    failureWindowMinutes:
      settings.alertThresholds === null ? '' : String(settings.alertThresholds.failureWindowMinutes),
    failureCount: settings.alertThresholds === null ? '' : String(settings.alertThresholds.failureCount),
  };
}

function toPatch(values: FormValues): SmsSettingsUpdatePatch {
  const alertThresholds =
    values.failureWindowMinutes.trim() === '' && values.failureCount.trim() === ''
      ? null
      : {
          failureWindowMinutes: Number(values.failureWindowMinutes),
          failureCount: Number(values.failureCount),
        };
  return {
    enabled: values.enabled,
    templateId: Number(values.templateId),
    senderLine: values.senderLine.trim() === '' ? null : values.senderLine.trim(),
    timeoutMs: Number(values.timeoutMs),
    deliveryStatusEnabled: values.deliveryStatusEnabled,
    outageMode: values.outageMode,
    maintenanceMessage: values.maintenanceMessage.trim() === '' ? null : values.maintenanceMessage.trim(),
    alertThresholds,
  };
}

function isUnchanged(values: FormValues, settings: SmsSettingsSnapshot['settings']): boolean {
  const patch = toPatch(values);
  return (
    patch.enabled === settings.enabled &&
    patch.templateId === settings.templateId &&
    patch.senderLine === settings.senderLine &&
    patch.timeoutMs === settings.timeoutMs &&
    patch.deliveryStatusEnabled === settings.deliveryStatusEnabled &&
    patch.outageMode === settings.outageMode &&
    patch.maintenanceMessage === settings.maintenanceMessage &&
    JSON.stringify(patch.alertThresholds) === JSON.stringify(settings.alertThresholds)
  );
}

/**
 * Editable, non-secret SMS provider settings (ADR-0011 / issue #115). Only the
 * server-derived `environment` is intentionally not editable and is shown in the
 * summary card. Save always carries `expectedVersion` from the hook for CAS.
 */
export function SmsSettingsForm({ snapshot, busy, onSubmit }: SmsSettingsFormProps) {
  const initial = useMemo(() => toFormValues(snapshot.settings), [snapshot.settings]);

  const form = useInHouseForm<FormValues>({
    initialValues: initial,
    schema: {
      templateId: { rules: [required(), positiveInteger] },
      timeoutMs: {
        rules: [required(), pattern(/^(?:0*[1-9]\d{0,3}|10000)$/, 'باید بین ۱ تا ۱۰۰۰۰ باشد')],
      },
      senderLine: { rules: [maxLength(64, 'حداکثر ۶۴ کاراکتر')] },
      maintenanceMessage: { rules: [maxLength(240, 'حداکثر ۲۴۰ کاراکتر')] },
      failureWindowMinutes: {
        rules: [positiveInteger],
        validate: bothOrNone,
      },
      failureCount: {
        rules: [positiveInteger],
        validate: bothOrNone,
      },
    },
    onSubmit: (values) => onSubmit(toPatch(values)),
  });

  const unchanged = isUnchanged(form.values, snapshot.settings);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          تنظیمات سرویس پیامک
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          فقط تنظیمات غیرمحرمانه از اینجا قابل ویرایش است؛ کلید پیامک از بخش «مدیریت کلید» اداره می‌شود.
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Box component="form" onSubmit={form.handleSubmit} noValidate>
          <Stack spacing={3}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <FormField label="سرویس پیامک">
                <FormControlRow
                  checked={form.values.enabled}
                  onChange={(checked) => form.handleChange('enabled', checked)}
                  label="ارسال پیامک OTP فعال باشد"
                  disabled={busy}
                />
              </FormField>
              <FormField label="درگاه اعلان وضعیت">
                <FormControlRow
                  checked={form.values.deliveryStatusEnabled}
                  onChange={(checked) => form.handleChange('deliveryStatusEnabled', checked)}
                  label="دریافت وضعیت تحویل پیام‌ها"
                  disabled={busy}
                />
              </FormField>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
              <TextField
                {...form.getFieldProps('templateId')}
                label="شناسهٔ قالب تأیید (templateId)"
                disabled={busy}
                slotProps={{ htmlInput: { inputMode: 'numeric', 'aria-required': true } }}
              />
              <TextField
                {...form.getFieldProps('timeoutMs')}
                label="مهلت درخواست (میلی‌ثانیه)"
                disabled={busy}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </Box>

            <FormField label="خط فرستنده (برای تشخیص)" helperText="درخواست تأیید، فیلد خط فرستنده نمی‌پذیرد؛ این مقدار فقط برای گزارش است.">
              <TextField
                {...form.getFieldProps('senderLine')}
                placeholder="مثال: +989120000000"
                disabled={busy}
              />
            </FormField>

            <FormField label="پیام «قطع سرویس» (خروجی اضطراری)">
              <TextField
                {...form.getFieldProps('maintenanceMessage')}
                multiline
                minRows={2}
                placeholder="در صورت فعال بودن حالت قطع سرویس نمایش داده می‌شود"
                disabled={busy}
              />
            </FormField>

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' },
                gap: 2,
              }}
            >
              <TextField
                {...form.getFieldProps('failureWindowMinutes')}
                label="دورهٔ خطا (دقیقه)"
                disabled={busy}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
              <TextField
                {...form.getFieldProps('failureCount')}
                label="آستانهٔ شمارش خطا"
                disabled={busy}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <FormField label="حالت قطع سرویس">
                  <FormControlRow
                    checked={form.values.outageMode}
                    onChange={(checked) => form.handleChange('outageMode', checked)}
                    label="fail-closed (توقف ارسال برابر با قطع سرویس)"
                    disabled={busy}
                  />
                </FormField>
              </Box>
            </Box>

            {form.values.outageMode ? (
              <Alert severity="warning">
                حالت قطع سرویس فعال است؛ تا غیرفعال‌شدن آن، ارسال پیامک انجام نمی‌شود.
              </Alert>
            ) : null}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
              <Button
                variant="outlined"
                color="secondary"
                onClick={form.reset}
                disabled={busy || unchanged}
              >
                بازنشانی
              </Button>
              <Button variant="contained" type="submit" disabled={busy || unchanged || form.submitting}>
                ذخیرهٔ تنظیمات
              </Button>
            </Box>
          </Stack>
        </Box>
      </CardContent>
    </Card>
  );
}

function FormControlRow({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled: boolean;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Switch checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled} inputProps={{ 'aria-label': label }} />
      <Typography variant="body2">{label}</Typography>
    </Box>
  );
}