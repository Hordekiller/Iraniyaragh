'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack } from '@mui/material';
import type { AttributeDefinitionDetail, AttributeDefinitionSummary, ProductAttributeConfiguration, ProductVariant } from '@iranyaragh/contracts';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiAbortError, ApiClientError } from '@/lib/api/client';
import { createIdempotencyKey, getAttribute, updateVariantAttributes } from '@/lib/catalog/catalog-api';

export function VariantAttributesDialog({ variant, configurations, definitions, onSaved, onClose }: {
  variant: ProductVariant;
  configurations: ProductAttributeConfiguration[];
  definitions: AttributeDefinitionSummary[];
  onSaved: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries((variant.attributeValues ?? []).map(value => [value.attributeCode, value.optionCode])));
  const [details, setDetails] = useState<AttributeDefinitionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const key = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    const ids = configurations.map(configuration => definitions.find(item => item.code === configuration.attributeCode)?.id);
    if (ids.some(id => !id)) { setError('تعریف ویژگی پیدا نشد؛ صفحهٔ کالا را دوباره بارگذاری کنید.'); setLoading(false); return () => controller.abort(); }
    Promise.all(ids.map(id => getAttribute(id!, controller.signal)))
      .then(results => { if (!controller.signal.aborted) setDetails(results.map(result => result.attribute)); })
      .catch((failure: unknown) => { if (!(failure instanceof ApiAbortError) && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'بارگذاری گزینه‌ها ناموفق بود.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [configurations, definitions, reload]);

  async function save() {
    if (configurations.some(configuration => configuration.isRequired && !values[configuration.attributeCode])) { setError('برای همهٔ ویژگی‌های اجباری مقدار انتخاب کنید.'); return; }
    setSaving(true);
    setError(null);
    key.current ??= createIdempotencyKey('variant-attributes');
    try {
      await updateVariantAttributes(variant.id, { expectedVersion: variant.version ?? 0, values: configurations.flatMap(configuration => values[configuration.attributeCode] ? [{ attributeCode: configuration.attributeCode, optionCode: values[configuration.attributeCode]! }] : []) }, key.current);
      feedback.success('مقادیر ویژگی‌های تنوع ذخیره شد.');
      onSaved();
      onClose();
    } catch (failure) {
      const messages: Record<string, string> = {
        DUPLICATE_VARIANT_COMBINATION: 'این ترکیب ویژگی‌ها برای تنوع دیگری ثبت شده است؛ ترکیب متفاوتی انتخاب کنید.',
        STALE_VERSION: 'نسخهٔ تنوع تغییر کرده است؛ پنجره را ببندید و صفحهٔ کالا را دوباره بارگذاری کنید.',
        ATTRIBUTE_OPTION_INVALID: 'گزینهٔ انتخاب‌شده معتبر نیست یا یک ویژگی اجباری خالی است.',
      };
      setError(failure instanceof ApiClientError ? messages[failure.code] ?? failure.message : 'ذخیره ناموفق بود؛ دوباره تلاش کنید.');
    } finally { setSaving(false); }
  }

  return <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="variant-attributes-title">
    <DialogTitle id="variant-attributes-title">مقادیر ویژگی‌ها — {variant.sku}</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
      {error ? <Alert severity="error" action={details.length === 0 ? <Button onClick={() => setReload(value => value + 1)}>تلاش مجدد</Button> : undefined}>{error}</Alert> : null}
      {loading ? <CircularProgress aria-label="بارگذاری گزینه‌ها" /> : configurations.map(configuration => {
        const definition = details.find(item => item.code === configuration.attributeCode);
        const current = values[configuration.attributeCode] ?? '';
        const options = definition?.options ?? [];
        return <FormField key={configuration.attributeCode} label={configuration.attributeName} htmlFor={`variant-attribute-${configuration.attributeCode}`} required={configuration.isRequired}>
          <Select id={`variant-attribute-${configuration.attributeCode}`} size="small" displayEmpty value={current} disabled={saving || !definition} inputProps={{ 'aria-label': configuration.attributeName }} onChange={event => { key.current = null; setValues(previous => ({ ...previous, [configuration.attributeCode]: String(event.target.value) })); }}>
            <MenuItem value="">انتخاب مقدار…</MenuItem>
            {options.filter(option => option.status === 'ACTIVE' || option.code === current).map(option => <MenuItem key={option.code} value={option.code} disabled={definition?.status !== 'ACTIVE' || option.status !== 'ACTIVE'}>{option.label}{option.status !== 'ACTIVE' ? ' (غیرفعال)' : ''}</MenuItem>)}
          </Select>
        </FormField>;
      })}
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>بستن</Button><Button variant="contained" onClick={() => void save()} disabled={saving || loading || details.length !== configurations.length}>{saving ? 'در حال ذخیره…' : 'ذخیرهٔ مقادیر ویژگی‌ها'}</Button></DialogActions>
  </Dialog>;
}
