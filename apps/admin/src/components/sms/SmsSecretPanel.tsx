'use client';

import { useState } from 'react';
import type { SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { Alert, Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { RotateCw, Trash2 } from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { SmsRotateSecretDialog } from './SmsRotateSecretDialog';
import { formatDateTime, smsLabels, yesNo } from '@/lib/sms/sms-labels';

export type SmsSecretPanelProps = {
  snapshot: SmsSettingsSnapshot;
  busy: boolean;
  onRotate: (secret: string) => void;
  onClear: () => void;
};

export function SmsSecretPanel({ snapshot, busy, onRotate, onClear }: SmsSecretPanelProps) {
  const [rotateOpen, setRotateOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const writable = snapshot.secretBackend === 'writable';
  const backend = smsLabels.backendOf(snapshot.secretBackend);

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            مدیریت کلید پیامک
          </Typography>
          <StatusChip label={backend.label} tone={backend.tone} />
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          کلید سرویس پیامک write-only است؛ فقط وضعیت و ماسک آن نمایش داده می‌شود و هرگز خود کلید.
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Box
          component="dl"
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, m: 0 }}
        >
          <SummaryItem term="پیکربندی شده" value={yesNo(snapshot.secret.configured)} />
          <SummaryItem term="اعتبارسنجی شده" value={yesNo(snapshot.secret.validated)} />
          <SummaryItem term="نمایش" value={snapshot.secret.masked ?? '—'} />
          <SummaryItem term="آخرین چرخش" value={formatDateTime(snapshot.secret.lastRotatedAt)} />
        </Box>

        {!writable ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            {backend.note} چرخش و پاک‌سازی کلید از این پنل در دسترس نیست.
          </Alert>
        ) : (
          <Stack direction="row" spacing={1} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color="warning"
              startIcon={<RotateCw size={17} />}
              onClick={() => setRotateOpen(true)}
              disabled={busy}
            >
              چرخش کلید
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<Trash2 size={17} />}
              onClick={() => setClearOpen(true)}
              disabled={busy}
            >
              پاک‌سازی کلید
            </Button>
          </Stack>
        )}
      </CardContent>

      <SmsRotateSecretDialog
        open={rotateOpen}
        setOpen={setRotateOpen}
        busy={busy}
        onSubmit={onRotate}
      />
      <ConfirmationDialog
        open={clearOpen}
        setOpen={setClearOpen}
        type="dangerous"
        title="پاک‌سازی کلید سرویس پیامک"
        description="پس از تأیید، کلید فعلی حذف می‌شود و تا ثبت کلید جدید، ارسال پیامک امکان‌پذیر نیست."
        confirmLabel="پاک‌سازی کلید"
        loading={busy}
        onConfirm={() => onClear()}
      />
    </Card>
  );
}

function SummaryItem({ term, value }: { term: string; value: string }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary">
        {term}
      </Typography>
      <Typography component="dd" variant="body2" sx={{ fontWeight: 700, mt: 0.25, mb: 0, direction: 'ltr' }}>
        {value}
      </Typography>
    </Box>
  );
}