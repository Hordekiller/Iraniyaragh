'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import type { CategorySummary } from '@iranyaragh/contracts';
import { ApiClientError } from '@/lib/api/client';
import { createCategory, createIdempotencyKey, updateCategory } from '@/lib/catalog/catalog-api';
import { SLUG_PATTERN } from '@/lib/catalog/catalog-labels';
import { FormField } from '@/components/ui/FormField';
import { useFeedback } from '@/components/ui/FeedbackProvider';

type CategoryDialogProps = {
  open: boolean;
  onClose: () => void;
  /** All categories (for the parent picker). */
  categories: CategorySummary[];
  /** When present the dialog edits this category instead of creating a new one. */
  category?: CategorySummary | null;
  onSaved: () => void;
};

export function CategoryDialog({ open, onClose, categories, category, onSaved }: CategoryDialogProps) {
  const feedback = useFeedback();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [errors, setErrors] = useState<{ name?: string; slug?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setSlug(category?.slug ?? '');
      setParentId(category?.parentId ?? '');
      setErrors({});
      setSubmitError(null);
    }
  }, [open, category]);

  // A category must never become its own parent.
  const parentOptions = categories.filter((item) => item.id !== category?.id);

  function validate(): boolean {
    const next: { name?: string; slug?: string } = {};
    if (!name.trim()) next.name = 'نام دسته‌بندی الزامی است.';
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
      if (category) {
        await updateCategory(category.id, {
          name: name.trim(),
          slug: slug.trim(),
          parentId: parentId || null,
        });
        feedback.success(`دسته‌بندی «${name.trim()}» به‌روزرسانی شد.`);
      } else {
        await createCategory({
          name: name.trim(),
          slug: slug.trim(),
          ...(parentId ? { parentId } : {}),
        }, createIdempotencyKey('catalog-category'));
        feedback.success(`دسته‌بندی «${name.trim()}» ساخته شد.`);
      }
      onSaved();
      onClose();
    } catch (error) {
      setSubmitError(
        error instanceof ApiClientError
          ? error.message
          : 'ذخیرهٔ دسته‌بندی ناموفق بود؛ دوباره تلاش کنید.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="category-dialog-title">
      <DialogTitle id="category-dialog-title">{category ? 'ویرایش دسته‌بندی' : 'دسته‌بندی جدید'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {submitError ? <Alert severity="error">{submitError}</Alert> : null}
          <FormField
            label="نام دسته‌بندی"
            required
            htmlFor="category-name"
            error={Boolean(errors.name)}
            errorText={errors.name}
          >
            <TextField
              id="category-name"
              size="small"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          <FormField
            label="شناسهٔ یکتا (Slug)"
            required
            htmlFor="category-slug"
            helperText="نمونه: door-locks"
            error={Boolean(errors.slug)}
            errorText={errors.slug}
          >
            <TextField
              id="category-slug"
              size="small"
              dir="ltr"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLocaleLowerCase('en-US').replace(/\s+/g, '-'))}
            />
          </FormField>
          <FormField label="دستهٔ والد" htmlFor="category-parent" helperText="خالی یعنی دستهٔ ریشه">
            <Select
              id="category-parent"
              size="small"
              displayEmpty
              value={parentId}
              inputProps={{ 'aria-label': 'دستهٔ والد' }}
              onChange={(event) => setParentId(String(event.target.value))}
            >
              <MenuItem value="">بدون والد</MenuItem>
              {parentOptions.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.name}
                </MenuItem>
              ))}
            </Select>
          </FormField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose} color="inherit">
          انصراف
        </Button>
        <Button type="submit" variant="contained" disabled={submitting} onClick={(e) => void submit(e)}>
          {submitting ? 'در حال ذخیره…' : category ? 'ذخیرهٔ تغییرات' : 'ساخت دسته‌بندی'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
