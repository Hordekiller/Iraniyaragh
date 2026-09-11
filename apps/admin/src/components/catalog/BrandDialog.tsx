'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { ApiClientError } from '@/lib/api/client';
import { createBrand, createIdempotencyKey, updateBrand } from '@/lib/catalog/catalog-api';
import { SLUG_PATTERN } from '@/lib/catalog/catalog-labels';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';
import type { BrandSummary } from '@iranyaragh/contracts';

type BrandDialogProps = {
  open: boolean;
  onClose: () => void;
  /** When present the dialog edits this brand instead of creating a new one. */
  brand?: BrandSummary | null;
  onSaved: () => void;
};

export function BrandDialog({ open, onClose, brand, onSaved }: BrandDialogProps) {
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(brand?.name ?? '');
      setSlug(brand?.slug ?? '');
      setErrors({});
      setSubmitError(null);
    }
  }, [open, brand]);

  function validate(): boolean {
    const next: { name?: string; slug?: string } = {};
    if (!name.trim()) next.name = 'نام برند الزامی است.';
    else if (name.trim().length > 150) next.name = 'حداکثر ۱۵۰ کاراکتر.';
    if (!slug.trim()) next.slug = 'شناسه (Slug) الزامی است.';
    else if (!SLUG_PATTERN.test(slug)) next.slug = 'شناسه فقط شامل a-z، عدد و خط تیره (-) باشد.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      if (brand) {
        await updateBrand(brand.id, { name: name.trim(), slug: slug.trim() });
        feedback.success(`برند «${name.trim()}» به‌روزرسانی شد.`);
      } else {
        await createBrand({ name: name.trim(), slug: slug.trim() }, createIdempotencyKey('catalog-brand'));
        feedback.success(`برند «${name.trim()}» ساخته شد.`);
      }
      onSaved();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof ApiClientError ? error.message : 'ذخیرهٔ برند ناموفق بود؛ دوباره تلاش کنید.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="brand-dialog-title">
      <DialogTitle id="brand-dialog-title">{brand ? 'ویرایش برند' : 'برند جدید'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          <FormField
            label="نام برند"
            required
            htmlFor="brand-name"
            error={Boolean(errors.name)}
            errorText={errors.name}
          >
            <TextField
              id="brand-name"
              size="small"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            label="شناسهٔ یکتا (Slug)"
            required
            htmlFor="brand-slug"
            helperText="نمونه: abanlock"
            error={Boolean(errors.slug)}
            errorText={errors.slug}
          >
            <TextField
              id="brand-slug"
              size="small"
              dir="ltr"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLocaleLowerCase('en-US').replace(/\s+/g, '-'))}
            />
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} color="inherit">
          انصراف
        </Button>
        <Button type="submit" variant="contained" disabled={submitting} onClick={(e) => void submit(e)}>
          {submitting ? 'در حال ذخیره…' : brand ? 'ذخیرهٔ تغییرات' : 'ساخت برند'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
