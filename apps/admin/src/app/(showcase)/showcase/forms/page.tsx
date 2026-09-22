'use client';

import { useState } from 'react';
import { Button, Stack, TextField, Typography, Box, Paper, Alert } from '@mui/material';
import { FormField } from '@/components/ui/FormField';
import {
  useInHouseForm,
  required,
  email,
  minLength,
  maxLength,
  pattern,
} from '@/components/ui/useInHouseForm';
import { FeedbackProvider, useFeedback } from '@/components/ui/FeedbackProvider';
import { RichTextEditor } from '@/components/editor/RichTextEditor';

type ProductForm = {
  name: string;
  sku: string;
  contactEmail: string;
  weight: string;
};

const schema = {
  name: { rules: [required(), minLength(3, 'نام باید حداقل ۳ کاراکتر باشد')] },
  sku: {
    rules: [
      required('کد کالا الزامی است'),
      pattern(/^[A-Z0-9-]+$/, 'کد کالا فقط شامل حروف بزرگ، عدد و خط تیره باشد'),
      maxLength(12, 'کد کالا حداکثر ۱۲ کاراکتر'),
    ],
  },
  contactEmail: { rules: [required(), email()] },
  weight: { rules: [required()] },
};

function ProductForm() {
  const feedback = useFeedback();
  const form = useInHouseForm<ProductForm>({
    initialValues: { name: '', sku: '', contactEmail: '', weight: '' },
    schema,
    onSubmit: async (values) => {
      await new Promise((r) => setTimeout(r, 600));
      feedback.success(`محصول «${values.name}» ثبت شد.`);
    },
  });

  return (
    <Paper component="form" onSubmit={form.handleSubmit} noValidate sx={{ p: 3, maxWidth: 560 }}>
      <Stack spacing={3}>
        <FormField label="نام محصول" required>
          <TextField
            {...form.getFieldProps('name')}
            size="small"
            placeholder="مثلاً قفل دستگیره‌ای"
          />
        </FormField>

        <FormField label="کد کالا (SKU)" required helperText="نمونه: LOCK-001">
          <TextField
            {...form.getFieldProps('sku')}
            size="small"
            placeholder="LOCK-001"
          />
        </FormField>

        <FormField label="ایمیل پشتیبانی" required>
          <TextField
            {...form.getFieldProps('contactEmail')}
            size="small"
            type="email"
            placeholder="support@example.com"
          />
        </FormField>

        <FormField label="وزن (گرم)" required>
          <TextField
            {...form.getFieldProps('weight')}
            size="small"
            inputMode="numeric"
          />
        </FormField>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
          <Button type="button" color="inherit" onClick={form.reset}>
            بازنشانی
          </Button>
          <Button type="submit" variant="contained" disabled={form.submitting}>
            {form.submitting ? 'در حال ثبت…' : 'ثبت محصول'}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

function RichTextEditorDemo() {
  const [html, setHtml] = useState(
    '<h2>توضیحات نمونه</h2><p>متن <strong>توصیف</strong> محصول با راست‌به‌چپ و ویرایشگر خودمیزبان.</p><ul><li>مورد اول</li><li>مورد دوم</li></ul>',
  );

  return (
    <Paper sx={{ p: 3, maxWidth: 860 }}>
      <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
        ویرایشگر متن غنی (Jodit)
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        ادیتور خودمیزبان برای توضیح محصول؛ خروجی HTML است و در لایه API پاک‌سازی می‌شود (ADR-0016).
      </Typography>
      <RichTextEditor
        value={html}
        onChange={setHtml}
        height={280}
        placeholder="متن توضیحات را بنویسید…"
        ariaLabel="ویرایشگر متن غنی (نمایش)"
      />
    </Paper>
  );
}

export default function FormsShowcasePage() {
  return (
    <FeedbackProvider>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>
            فرم و اعتبارسنجی
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            اعتبارسنجی داخلی (ADR-0009) و پیام‌های بازخورد. پس از ارسال موفق یک پیام نمایش داده می‌شود.
          </Typography>
        </Box>
        <Alert severity="info" sx={{ maxWidth: 560 }}>
          دکمه «ثبت محصول» را با فیلدهای خالی امتحان کنید تا خطاهای اعتبارسنجی نمایش داده شوند.
        </Alert>
        <ProductForm />
        <RichTextEditorDemo />
      </Stack>
    </FeedbackProvider>
  );
}
