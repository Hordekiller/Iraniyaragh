'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Typography,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { AttributeDefinitionSummary, ProductAttributeConfigurationPayload, ProductDetail } from '@iranyaragh/contracts';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import { AttributeDialog } from './AttributeDialog';
import { configureProductAttributes } from '@/lib/catalog/catalog-api';

function serialize(configs: ProductAttributeConfigurationPayload[]): string {
  return JSON.stringify(
    configs
      .map((configuration) => ({
        attributeCode: configuration.attributeCode,
        isVariantAxis: configuration.isVariantAxis,
        isRequired: Boolean(configuration.isRequired),
      }))
      .sort((a, b) => a.attributeCode.localeCompare(b.attributeCode)),
  );
}

export function AttributeConfigEditor({
  product,
  allAttributes,
  canWrite,
  onChanged,
  onAttributeCreated,
}: {
  product: ProductDetail;
  allAttributes: AttributeDefinitionSummary[];
  canWrite: boolean;
  onChanged: () => void;
  onAttributeCreated: (attribute: AttributeDefinitionSummary) => void;
}) {
  const feedback = useFeedback();
  const [draft, setDraft] = useState<ProductAttributeConfigurationPayload[]>(() =>
    (product.attributes ?? []).map((attribute) => ({
      attributeCode: attribute.attributeCode,
      isVariantAxis: attribute.isVariantAxis,
      isRequired: attribute.isRequired,
    })),
  );
  const [creating, setCreating] = useState(false);
  const [addCode, setAddCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const originalKey = useMemo(() => serialize(product.attributes ?? []), [product.attributes]);
  const dirty = serialize(draft) !== originalKey;

  useEffect(() => {
    setDraft(
      (product.attributes ?? []).map((attribute) => ({
        attributeCode: attribute.attributeCode,
        isVariantAxis: attribute.isVariantAxis,
        isRequired: attribute.isRequired,
      })),
    );
  }, [product.attributes]);

  const nameByCode = useMemo(() => {
    const map = new Map(allAttributes.map((attribute) => [attribute.code, attribute.name]));
    (product.attributes ?? []).forEach((attribute) => {
      map.set(attribute.attributeCode, attribute.attributeName);
    });
    return map;
  }, [allAttributes, product.attributes]);

  const candidates = allAttributes
    .filter((attribute) => attribute.status === 'ACTIVE')
    .filter((attribute) => !draft.some((configuration) => configuration.attributeCode === attribute.code));

  function update(index: number, patch: Partial<ProductAttributeConfigurationPayload>) {
    setError(null);
    setDraft((current) =>
      current.map((configuration, i) => {
        if (i !== index) return configuration;
        const next = { ...configuration, ...patch };
        if (!next.isVariantAxis) next.isRequired = false;
        return next;
      }),
    );
  }

  function remove(index: number) {
    setError(null);
    setDraft((current) => current.filter((_, i) => i !== index));
  }

  function addSelected() {
    if (!addCode) return;
    setError(null);
    setDraft((current) => [...current, { attributeCode: addCode, isVariantAxis: false, isRequired: false }]);
    setAddCode('');
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const result = await configureProductAttributes(product.id, product.version ?? 0, draft);
      feedback.success(`ویژگی‌های «${result.product.name}» به‌روزرسانی شد.`);
      onChanged();
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'STALE_VERSION') {
        setError('اطلاعات کالا در همان لحظه توسط شخص دیگری تغییر کرد؛ صفحه برای بارگذاری نسخهٔ تازه به‌روزرسانی می‌شود.');
        onChanged();
      } else {
        setError(error instanceof ApiClientError ? error.code === 'AXIS_IN_USE' ? 'ویژگی دارای مقدار ذخیره‌شده را نمی‌توان به محور تبدیل کرد یا محور استفاده‌شده را حذف کرد؛ ابتدا مقادیر مرتبط SKUها را بررسی کنید.' : error.message : 'ذخیرهٔ ویژگی‌ها ناموفق بود؛ دوباره تلاش کنید.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box>
      <Stack spacing={2}>
        {canWrite ? <Button size="small" onClick={() => setCreating(true)} startIcon={<Plus size={16} />}>تعریف ویژگی جدید و گزینه‌های آن</Button> : null}
        {creating ? <AttributeDialog mode="create" onClose={() => setCreating(false)} onSaved={(attribute) => {
          onAttributeCreated(attribute);
          setDraft((current) => [...current, { attributeCode: attribute.code, isVariantAxis: false, isRequired: false }]);
        }} /> : null}
        <Typography variant="body2" color="text.secondary">پس از ذخیرهٔ ویژگی‌ها، از اقدامات هر SKU «مقادیر ویژگی‌ها» را انتخاب کنید. محور واریانت برای ترکیب‌های متفاوت مانند رنگ و سایز است.</Typography>
        {error ? <Alert severity="error">{error}</Alert> : null}
        {draft.length === 0 ? (
          <Alert severity="info">ویژگی‌ای به این کالا متصل نیست.{' '}
            {candidates.length === 0
              ? 'هنوز ویژگی فعالی تعریف نشده؛ ابتدا از صفحهٔ «ویژگی‌ها» یک ویژگی بسازید.'
              : 'از فهرست پایین یک ویژگی اضافه کنید.'}
          </Alert>
        ) : (
          draft.map((configuration, index) => (
            <Stack key={configuration.attributeCode} direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="body1" fontWeight={600} sx={{ flexGrow: 1 }}>
                {nameByCode.get(configuration.attributeCode) ?? configuration.attributeCode}
              </Typography>
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={configuration.isVariantAxis}
                    onChange={(event) => update(index, { isVariantAxis: event.target.checked })}
                    disabled={!canWrite || saving}
                    inputProps={{ 'aria-label': `${configuration.attributeCode} محور واریانت` }}
                  />
                }
                label="محور واریانت"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    size="small"
                    checked={Boolean(configuration.isRequired)}
                    disabled={!canWrite || saving || !configuration.isVariantAxis}
                    onChange={(event) => update(index, { isRequired: event.target.checked })}
                    inputProps={{ 'aria-label': `${configuration.attributeCode} اجباری` }}
                  />
                }
                label="اجباری"
              />
              {canWrite ? (
                <IconButton
                  size="small"
                  disabled={saving}
                  aria-label={`حذف ویژگی ${configuration.attributeCode}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 size={16} />
                </IconButton>
              ) : null}
            </Stack>
          ))
        )}

        {canWrite ? (
          <Stack direction="row" spacing={1.5} alignItems="flex-end">
            <FormField label="افزودن ویژگی" htmlFor="attribute-config-add" helperText="فقط ویژگی‌های فعال نمایش داده می‌شوند." disabled={candidates.length === 0}>
              <Select
                id="attribute-config-add"
                size="small"
                disabled={saving}
                displayEmpty
                value={addCode}
                inputProps={{ 'aria-label': 'افزودن ویژگی' }}
                onChange={(event) => setAddCode(String(event.target.value))}
              >
                <MenuItem value="">انتخاب ویژگی…</MenuItem>
                {candidates.map((attribute) => (
                  <MenuItem key={attribute.code} value={attribute.code}>
                    {attribute.name}
                  </MenuItem>
                ))}
              </Select>
            </FormField>
            <Button
              type="button"
              size="small"
              startIcon={<Plus size={16} />}
              disabled={!addCode || saving}
              onClick={addSelected}
            >
              افزودن
            </Button>
          </Stack>
        ) : null}

        {canWrite ? (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="button" variant="contained" size="small" disabled={!dirty || saving} onClick={() => void handleSave()}>
              {saving ? 'در حال ذخیره…' : 'ذخیرهٔ ویژگی‌ها'}
            </Button>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}