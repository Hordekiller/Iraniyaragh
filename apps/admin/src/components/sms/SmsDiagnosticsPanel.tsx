'use client';

import type { SmsDiagnostics } from '@iranyaragh/contracts';
import { Box, Card, CardContent, Divider, Typography } from '@mui/material';
import { StatusChip } from '@/components/ui/StatusChip';
import { formatDateTime, smsLabels } from '@/lib/sms/sms-labels';

export type SmsDiagnosticsPanelProps = {
  diagnostics: SmsDiagnostics | null;
};

export function SmsDiagnosticsPanel({ diagnostics }: SmsDiagnosticsPanelProps) {
  if (!diagnostics) return null;
  const health = smsLabels.health(diagnostics.providerHealth);
  const circuit = smsLabels.circuit(diagnostics.circuitState);

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          تشخیص فنی
        </Typography>
        <Divider sx={{ my: 2 }} />

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          <StatusChip label={`سلامت: ${health.label}`} tone={health.tone} />
          <StatusChip label={`مدار: ${circuit.label}`} tone={circuit.tone} />
        </Box>

        <Box
          component="dl"
          sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, m: 0 }}
        >
          <SummaryItem term="آخرین ارسال موفق" value={formatDateTime(diagnostics.lastSuccessfulSendAt)} />
          <SummaryItem term="آخرین خطای رخ‌داده" value={smsLabels.errorClass(diagnostics.lastErrorClass)} />
        </Box>
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