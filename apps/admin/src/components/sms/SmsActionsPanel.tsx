'use client';

import { useState } from 'react';
import type { SmsSendOutcome, SmsValidation } from '@iranyaragh/contracts';
import { Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material';
import { Send, Stethoscope } from 'lucide-react';
import { ConfirmationDialog } from '@/components/ui/ConfirmationDialog';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDateTime, smsLabels } from '@/lib/sms/sms-labels';
import type { SmsActionKey } from '@/lib/sms/use-sms-settings';

export type SmsActionsPanelProps = {
  busy: SmsActionKey;
  lastValidation: SmsValidation | null;
  lastOutcome: SmsSendOutcome | null;
  onValidate: () => void;
  onTestSend: () => void;
};

export function SmsActionsPanel({ busy, lastValidation, lastOutcome, onValidate, onTestSend }: SmsActionsPanelProps) {
  const [testOpen, setTestOpen] = useState(false);
  const validateBusy = busy === 'validate';
  const testBusy = busy === 'test';

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          بررسی و ارسال آزمایشی
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          بررسی پیکربندی بدون هزینه است؛ ارسال آزمایشی یک پیام واقعی ارسال می‌کند و نیاز به تأیید دارد.
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <Button
            variant="contained"
            startIcon={<Stethoscope size={17} />}
            onClick={onValidate}
            disabled={busy !== null}
          >
            {validateBusy ? 'در حال بررسی...' : 'بررسی پیکربندی'}
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<Send size={17} />}
            onClick={() => setTestOpen(true)}
            disabled={busy !== null}
          >
            ارسال پیام آزمایشی
          </Button>
        </Stack>

        {lastValidation ? (
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, m: 0 }}>
            <ResultItem label="نتیجهٔ بررسی" value={<StatusChip {...smsLabels.health(lastValidation.providerHealth)} />} />
            <ResultItem label="زمان بررسی" value={formatDateTime(lastValidation.lastCheckedAt)} />
          </Box>
        ) : null}

        {lastOutcome ? (
          <Box sx={{ mt: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
              <Typography variant="caption" color="text.secondary">
                نتیجهٔ ارسال آزمایشی:
              </Typography>
              <StatusChip {...smsLabels.sendStatus(lastOutcome.status)} />
              {lastOutcome.messageId ? (
                <Typography variant="caption" color="text.secondary" dir="ltr">
                  شناسه: {lastOutcome.messageId}
                </Typography>
              ) : null}
            </Stack>
          </Box>
        ) : null}
      </CardContent>

      <ConfirmationDialog
        open={testOpen}
        setOpen={setTestOpen}
        type="dangerous"
        title="ارسال پیام آزمایشی"
        description="این عملیات یک پیام واقعی از طریق سرویس پیامک ارسال می‌کند (ورود به حساب سرویس)."
        confirmLabel="ارسال آزمایشی"
        loading={testBusy}
        onConfirm={onTestSend}
      />
    </Card>
  );
}

function ResultItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography component="dt" variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Box component="dd" sx={{ mt: 0.25, mb: 0 }}>
        {value}
      </Box>
    </Box>
  );
}