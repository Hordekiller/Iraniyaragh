'use client';

import type { SmsDiagnostics, SmsSettingsSnapshot } from '@iranyaragh/contracts';
import { Box, Card, CardContent, Divider, Typography } from '@mui/material';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDateTime, smsLabels, yesNo } from '@/lib/sms/sms-labels';

export type SmsSettingsSummaryProps = {
  snapshot: SmsSettingsSnapshot;
  diagnostics: SmsDiagnostics | null;
};

export function SmsSettingsSummary({ snapshot, diagnostics }: SmsSettingsSummaryProps) {
  const backend = smsLabels.backendOf(snapshot.secretBackend);
  const health = diagnostics ? smsLabels.health(diagnostics.providerHealth) : null;

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            وضعیت سرویس پیامک
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <StatusChip label={`محیط: ${smsLabels.environment(snapshot.settings.environment)}`} tone="neutral" />
            <StatusChip label={backend.label} tone={backend.tone} />
            {health ? <StatusChip label={`سلامت سرویس: ${health.label}`} tone={health.tone} /> : null}
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Box
          component="dl"
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
            gap: 2,
            m: 0,
          }}
        >
          <SummaryItem term="کلید پیکربندی" value={yesNo(snapshot.secret.configured)} />
          <SummaryItem term="اعتبار کلید" value={yesNo(snapshot.secret.validated)} />
          <SummaryItem term="نمایش کلید" value={snapshot.secret.masked ?? '—'} />
          <SummaryItem term="آخرین چرخش" value={formatDateTime(snapshot.secret.lastRotatedAt)} />
          <SummaryItem term="نسخهٔ تنظیمات" value={String(snapshot.version)} />
          <SummaryItem term="آخرین به‌روزرسانی" value={formatDateTime(snapshot.updatedAt)} />
        </Box>

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
          {backend.note}
        </Typography>
      </CardContent>
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