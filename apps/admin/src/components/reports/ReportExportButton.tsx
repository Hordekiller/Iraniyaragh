'use client';
import { useState } from 'react';
import { Button, Menu, MenuItem, Stack, Typography } from '@mui/material';
import { Download } from 'lucide-react';
import type { ReportExportDefinition, ReportExportOutputFormat } from '@iranyaragh/contracts';
import {
  requestReportExport,
  getReportExportStatus,
  downloadReportExport,
} from '@/lib/reports/report-export-api';
import { ApiClientError } from '@/lib/api/client';

function key() {
  return `report-export-${globalThis.crypto.randomUUID()}`;
}

async function poll(id: string) {
  for (let i = 0; i < 30; i += 1) {
    const s = await getReportExportStatus(id);
    if (s.status === 'READY') return s;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('timeout');
}

export function ReportExportButton({
  definition,
  disabled,
}: {
  definition: ReportExportDefinition;
  disabled?: boolean;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async (format: ReportExportOutputFormat) => {
    setAnchor(null);
    setBusy(true);
    setMsg(null);
    try {
      const r = await requestReportExport(definition, format, key());
      await poll(r.exportId);
      const blob = await downloadReportExport(r.exportId);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${r.exportId}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      a.click();
      window.URL.revokeObjectURL(url);
      setMsg('دانلود انجام شد');
    } catch (e) {
      if (e instanceof ApiClientError) setMsg(e.message);
      else setMsg('خطا در خروجی گزارش');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Button
        variant="outlined"
        size="small"
        startIcon={<Download size={16} />}
        disabled={disabled || busy}
        onClick={(e) => setAnchor(e.currentTarget)}
      >
        {busy ? 'در حال تهیه...' : 'خروجی'}
      </Button>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => void run('csv')}>CSV</MenuItem>
        <MenuItem onClick={() => void run('xlsx')}>Excel (XLSX)</MenuItem>
      </Menu>
      {msg ? <Typography variant="caption">{msg}</Typography> : null}
    </Stack>
  );
}
