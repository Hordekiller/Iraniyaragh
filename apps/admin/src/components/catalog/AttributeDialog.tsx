'use client';

import { useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import type { AttributeDefinitionSummary, AttributeStatus } from '@iranyaragh/contracts';
import { DialogCloseButton } from '@/components/ui/DialogCloseButton';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import { ApiClientError } from '@/lib/api/client';
import { createAttribute, createIdempotencyKey, updateAttribute } from '@/lib/catalog/catalog-api';
import { SLUG_PATTERN } from '@/lib/catalog/catalog-labels';

type OptionDraft = { code: string; label: string };
type FieldErrors = Partial<Record<'code' | 'name', string>> & Record<string, string | undefined>;

function validateCreate(code: string, name: string, options: OptionDraft[]): FieldErrors {
  const errors: FieldErrors = {};
  if (!code.trim()) errors.code = 'کد ویژگی الزامی است.';
  else if (!SLUG_PATTERN.test(code.trim())) errors.code = 'کد فقط شامل a-z، عدد و خط تیره (-) باشد.';
  if (!name.trim()) errors.name = 'نام ویژگی الزامی است.';
  options.forEach((option, index) => {
    if (!option.code.trim()) errors[`option-${index}-code`] = 'کد گزینه الزامی است.';
    else if (!SLUG_PATTERN.test(option.code.trim())) errors[`option-${index}-code`] = 'کد فقط شامل a-z، عدد و خط تیره (-) باشد.';
    if (!option.label.trim()) errors[`option-${index}-label`] = 'برچسب گزینه الزامی است.';
  });
  return errors;
}

export function AttributeDialog({
  mode,
  attribute,
  onSaved,
  onClose,
}: {
  mode: 'create' | 'edit';
  attribute?: AttributeDefinitionSummary;
  onSaved: () => void;
  onClose: () => void;
}) {
  const feedback = useFeedback();
  const editing = mode === 'edit';
  const [code, setCode] = useState(attribute?.code ?? '');
  const [name, setName] = useState(attribute?.name ?? '');
  const [description, setDescription] = useState(attribute?.description ?? '');
  const [status, setStatus] = useState<AttributeStatus>(attribute?.status ?? 'ACTIVE');
  const [options, setOptions] = useState<OptionDraft[]>([]);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const createKeyRef = useRef<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = editing ? {} : validateCreate(code, name, options);
    setErrors(nextErrors);
    if (Object.values(nextErrors).some(Boolean)) return;

    setSaving(true);
    try {
      if (editing) {
        await updateAttribute(attribute!.id, {
          ...(name.trim() !== attribute!.name ? { name: name.trim() } : {}),
          ...(description.trim() !== (attribute!.description ?? '')
            ? { description: description.trim() || null }
            : {}),
          ...(status !== attribute!.status ? { status } : {}),
          expectedVersion: attribute!.version,
        });
        feedback.success(`ویژگی «${name.trim()}» به‌روزرسانی شد.`);
      } else {
        const key = (createKeyRef.current ??= createIdempotencyKey('catalog-attribute'));
        await createAttribute(
          {
            code: code.trim(),
            name: name.trim(),
            ...(description.trim() ? { description: description.trim() } : {}),
            status: 'ACTIVE',
            ...(options.length > 0
              ? {
                  options: options.map((option) => ({ code: option.code.trim(), label: option.label.trim() })),
                }
              : {}),
          },
          key,
        );
        feedback.success(`ویژگی «${name.trim()}» ساخته شد.`);
        createKeyRef.current = null;
      }
      onSaved();
      onClose();
    } catch (error) {
      feedback.error(error instanceof ApiClientError ? error.message : 'ثبت ویژگی ناموفق بود؛ دوباره تلاش کنید.');
    } finally {
      setSaving(false);
    }
  }

  function setOption(index: number, patch: Partial<OptionDraft>) {
    setOptions((current) => current.map((option, i) => (i === index ? { ...option, ...patch } : option)));
    setErrors((current) => ({
      ...current,
      [`option-${index}-code`]: undefined,
      [`option-${index}-label`]: undefined,
    }));
  }

  const titleId = 'attribute-dialog-title';

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="sm" scroll="body" aria-labelledby={titleId}>
      <DialogCloseButton onClick={onClose} disabled={saving} />
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogContent>
          <DialogTitle id={titleId} sx={{ p: 0, mb: 2 }}>
            {editing ? 'ویرایش ویژگی' : 'ویژگی جدید'}
          </DialogTitle>
          <Stack spacing={2.5}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="کد"
                required
                htmlFor="attribute-code"
                helperText="انگلیسی، کوچک و بدون فاصله"
                error={Boolean(errors.code)}
                errorText={errors.code}
                disabled={editing}
              >
                <TextField
                  id="attribute-code"
                  size="small"
                  dir="ltr"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toLocaleLowerCase('en-US'))}
                />
              </FormField>
              <FormField label="نام" required htmlFor="attribute-name" error={Boolean(errors.name)} errorText={errors.name}>
                <TextField id="attribute-name" size="small" value={name} onChange={(event) => setName(event.target.value)} />
              </FormField>
            </Stack>
            <FormField label="توضیحات" htmlFor="attribute-description">
              <TextField
                id="attribute-description"
                size="small"
                multiline
                minRows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </FormField>
            {editing ? (
              <FormField label="وضعیت" htmlFor="attribute-status">
                <Select
                  id="attribute-status"
                  size="small"
                  value={status}
                  inputProps={{ 'aria-label': 'وضعیت ویژگی' }}
                  onChange={(event) => setStatus(event.target.value as AttributeStatus)}
                >
                  <MenuItem value="ACTIVE">فعال</MenuItem>
                  <MenuItem value="INACTIVE">غیرفعال</MenuItem>
                </Select>
              </FormField>
            ) : null}

            {!editing ? (
              <>
                <Divider />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="subtitle2" fontWeight={700}>
                    گزینه‌ها
                  </Typography>
                  <Button
                    type="button"
                    size="small"
                    startIcon={<Plus size={16} />}
                    onClick={() => {
                      setOptions((current) => [...current, { code: '', label: '' }]);
                    }}
                  >
                    افزودن گزینه
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary">
                  گزینه‌ها را می‌توانید همین‌جا یا بعداً از فهرست ویژگی‌ها بسازید.
                </Typography>
                {options.length === 0 ? (
                  <Typography variant="caption" color="text.secondary">
                    هنوز گزینه‌ای اضافه نشده است.
                  </Typography>
                ) : (
                  options.map((option, index) => (
                    <Stack key={index} direction="row" spacing={1.5} alignItems="flex-start">
                      <FormField
                        label="کد"
                        required
                        htmlFor={`attribute-option-${index}-code`}
                        error={Boolean(errors[`option-${index}-code`])}
                        errorText={errors[`option-${index}-code`]}
                      >
                        <TextField
                          id={`attribute-option-${index}-code`}
                          size="small"
                          dir="ltr"
                          value={option.code}
                          onChange={(event) => setOption(index, { code: event.target.value.toLocaleLowerCase('en-US') })}
                        />
                      </FormField>
                      <FormField
                        label="برچسب"
                        required
                        htmlFor={`attribute-option-${index}-label`}
                        error={Boolean(errors[`option-${index}-label`])}
                        errorText={errors[`option-${index}-label`]}
                      >
                        <TextField
                          id={`attribute-option-${index}-label`}
                          size="small"
                          value={option.label}
                          onChange={(event) => setOption(index, { label: event.target.value })}
                        />
                      </FormField>
                      <IconButton
                        aria-label={`حذف گزینه ${index + 1}`}
                        size="small"
                        sx={{ mt: 2 }}
                        onClick={() =>
                          setOptions((current) => current.filter((_, i) => i !== index))
                        }
                      >
                        <Trash2 size={16} />
                      </IconButton>
                    </Stack>
                  ))
                )}
              </>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'flex-end', gap: 1, px: 3, pb: 2 }}>
          <Button type="button" variant="outlined" color="secondary" onClick={onClose} disabled={saving}>
            انصراف
          </Button>
          <Button type="submit" variant="contained" disabled={saving} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
            {saving ? 'در حال ذخیره…' : (editing ? 'ذخیره' : 'ساخت ویژگی')}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}