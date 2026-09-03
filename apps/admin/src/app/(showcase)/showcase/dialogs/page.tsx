'use client';

import { useState } from 'react';
import { Box, Button, Stack, Typography, Alert } from '@mui/material';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';

export default function DialogsShowcasePage() {
  const [openDelete, setOpenDelete] = useState(false);
  const [openResolve, setOpenResolve] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" fontWeight={700}>
          دیالوگ‌ها و تأیید
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
          دیالوگ تأیید با دلیل الزامی، حالت بارگذاری و پشتیبانی از کلید Enter.
        </Typography>
      </Box>

      {result && (
        <Alert severity="success" onClose={() => setResult(null)}>
          {result}
        </Alert>
      )}

      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Button variant="contained" color="error" onClick={() => setOpenDelete(true)}>
          حذف با دلیل الزامی
        </Button>
        <Button variant="outlined" onClick={() => setOpenResolve(true)}>
          تأیید ساده
        </Button>
      </Stack>

      <ConfirmationDialog
        open={openDelete}
        setOpen={setOpenDelete}
        type="delete"
        title="حذف مشتری"
        description="این مشتری و تمام سوابق آن حذف خواهند شد. این عملیات قابل بازگشت نیست."
        confirmLabel="حذف"
        requireReason
        reasonLabel="دلیل حذف"
        reasonPlaceholder="دلیل حذف مشتری را وارد کنید"
        onConfirm={(reason) => setResult(`مشتری با دلیل «${reason}» حذف شد.`)}
      />

      <ConfirmationDialog
        open={openResolve}
        setOpen={setOpenResolve}
        type="archive"
        title="بایگانی سفارش"
        description="آیا از بایگانی این سفارش مطمئن هستید؟"
        confirmLabel="بایگانی"
        onConfirm={() => setResult('سفارش بایگانی شد.')}
        result={null}
      />
    </Stack>
  );
}
